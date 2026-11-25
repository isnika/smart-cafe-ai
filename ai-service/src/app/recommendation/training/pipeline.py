from __future__ import annotations

import json
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from src.app.recommendation.models.offline import (
    BPRModel,
    ContentModel,
    ImplicitALSModel,
    ItemItemModel,
    PopularityModel,
    normalize_scores,
)
from src.app.recommendation.service.recommendation_service import RecommendationService
from src.app.recommendation.training.artifact import ARTIFACT_SCHEMA_VERSION, save_artifact
from src.app.recommendation.training.dataset import (
    TemporalSplit,
    aggregate_events,
    fingerprint,
    load_training_data,
)


@dataclass
class ModelBundle:
    popularity: PopularityModel
    content: ContentModel
    item_item: ItemItemModel
    als: ImplicitALSModel | None
    bpr: BPRModel | None
    current_hybrid: dict[str, dict[int, float]]
    unavailable: dict[str, str]


@dataclass(frozen=True)
class CandidateConfig:
    name: str
    kind: str
    latent: str | None = None
    weights: tuple[float, float, float] | None = None


def _write_baseline_snapshot(products: pd.DataFrame, interactions: pd.DataFrame, directory: Path) -> None:
    products.to_csv(directory / "products.csv", index=False, encoding="utf-8-sig")
    interactions.to_csv(directory / "user_item_summary.csv", index=False, encoding="utf-8-sig")


def _current_hybrid_scores(
    products: pd.DataFrame,
    interactions: pd.DataFrame,
    as_of: pd.Timestamp,
) -> dict[str, dict[int, float]]:
    """Run the unchanged serving implementation as an evaluation candidate."""

    with tempfile.TemporaryDirectory(prefix="recommendation-baseline-") as raw_directory:
        directory = Path(raw_directory)
        _write_baseline_snapshot(products, interactions, directory)
        service = RecommendationService(
            data_dir=directory,
            as_of=as_of,
            trending_window_days=30,
            model_version="baseline-current",
        )
        result: dict[str, dict[int, float]] = {}
        for user_id in sorted(interactions["user_id"].astype(str).unique()):
            items = service.recommend(
                user_id=user_id,
                mode="personalized",
                discovery=True,
                # Reuse the serving baseline without violating the API's
                # top_k contract (1..50). Evaluation only needs a bounded
                # candidate list; the public API remains unchanged.
                top_k=min(50, len(products)),
            )
            result[user_id] = {
                int(item["product_id"]): float(item["score"])
                for item in items
            }
        return result


def fit_bundle(
    products: pd.DataFrame,
    interactions: pd.DataFrame,
    as_of: pd.Timestamp,
    random_state: int = 42,
) -> ModelBundle:
    unavailable: dict[str, str] = {}
    popularity = PopularityModel.fit(products, interactions, as_of)
    content = ContentModel.fit(products)
    item_item = ItemItemModel.fit(products, interactions)
    try:
        als = ImplicitALSModel.fit(products, interactions, random_state=random_state)
    except Exception as exc:  # pragma: no cover - defensive CLI boundary
        als = None
        unavailable["als"] = f"{type(exc).__name__}: {exc}"
    try:
        bpr = BPRModel.fit(products, interactions, random_state=random_state)
    except Exception as exc:  # pragma: no cover - defensive CLI boundary
        bpr = None
        unavailable["bpr"] = f"{type(exc).__name__}: {exc}"
    return ModelBundle(
        popularity=popularity,
        content=content,
        item_item=item_item,
        als=als,
        bpr=bpr,
        current_hybrid=_current_hybrid_scores(products, interactions, as_of),
        unavailable=unavailable,
    )


def candidate_configs(bundle: ModelBundle) -> list[CandidateConfig]:
    configs = [
        CandidateConfig("popularity", "popularity"),
        CandidateConfig("content_tfidf", "content"),
        CandidateConfig("item_item_cosine", "item_item"),
        CandidateConfig("current_hybrid", "current_hybrid"),
    ]
    for latent_name, model in (("als", bundle.als), ("bpr", bundle.bpr)):
        if model is None:
            continue
        configs.append(CandidateConfig(latent_name, latent_name))
        for latent_weight, content_weight, popularity_weight in (
            (0.70, 0.20, 0.10),
            (0.50, 0.30, 0.20),
            (0.40, 0.40, 0.20),
            (0.40, 0.20, 0.40),
        ):
            name = (
                f"hybrid_{latent_name}_l{latent_weight:.2f}_c{content_weight:.2f}"
                f"_p{popularity_weight:.2f}"
            )
            configs.append(
                CandidateConfig(
                    name,
                    "hybrid",
                    latent=latent_name,
                    weights=(latent_weight, content_weight, popularity_weight),
                )
            )
    return configs


def _raw_scores(
    config: CandidateConfig,
    bundle: ModelBundle,
    user_id: str,
    interactions: pd.DataFrame,
    as_of: pd.Timestamp,
) -> dict[int, float]:
    if config.kind == "popularity":
        return bundle.popularity.score_user(user_id)
    if config.kind == "content":
        return bundle.content.score_user(user_id, interactions, as_of)
    if config.kind == "item_item":
        return bundle.item_item.score_user(user_id, interactions, as_of)
    if config.kind == "current_hybrid":
        return bundle.current_hybrid.get(str(user_id), {})
    if config.kind == "als" and bundle.als is not None:
        return bundle.als.score_user(user_id)
    if config.kind == "bpr" and bundle.bpr is not None:
        return bundle.bpr.score_user(user_id)
    if config.kind == "hybrid" and config.latent and config.weights:
        latent_model = bundle.als if config.latent == "als" else bundle.bpr
        if latent_model is None:
            return {}
        latent_scores = normalize_scores(latent_model.score_user(user_id))
        content_scores = normalize_scores(bundle.content.score_user(user_id, interactions, as_of))
        popularity_scores = normalize_scores(bundle.popularity.score_user(user_id))
        candidate_ids = set(latent_scores) | set(content_scores) | set(popularity_scores)
        return {
            product_id: (
                config.weights[0] * latent_scores.get(product_id, 0.0)
                + config.weights[1] * content_scores.get(product_id, 0.0)
                + config.weights[2] * popularity_scores.get(product_id, 0.0)
            )
            for product_id in candidate_ids
        }
    return {}


def recommend_ids(
    config: CandidateConfig,
    bundle: ModelBundle,
    user_id: str,
    interactions: pd.DataFrame,
    as_of: pd.Timestamp,
    catalog_ids: set[int],
    top_k: int,
    discovery: bool = True,
) -> list[int]:
    scores = normalize_scores(_raw_scores(config, bundle, user_id, interactions, as_of))
    purchased = set(
        interactions.loc[
            interactions["user_id"].astype(str) == str(user_id), "product_id"
        ].astype(int)
    )
    ranked = [
        (product_id, score)
        for product_id, score in scores.items()
        if product_id in catalog_ids
        and (not discovery or product_id not in purchased)
        and score > 0
    ]
    ranked.sort(key=lambda pair: (-pair[1], pair[0]))
    return [product_id for product_id, _ in ranked[:top_k]]


def _future_users(
    history: pd.DataFrame,
    future_events: pd.DataFrame,
) -> dict[str, set[int]]:
    history_users = set(history["user_id"].astype(str))
    result: dict[str, set[int]] = {}
    for user_id, group in future_events.groupby(future_events["user_id"].astype(str)):
        user_id = str(user_id)
        if user_id not in history_users:
            continue
        purchased = set(
            history.loc[history["user_id"].astype(str) == user_id, "product_id"].astype(int)
        )
        relevant = set(group["product_id"].astype(int)) - purchased
        if relevant:
            result[user_id] = relevant
    return result


def _ndcg(recommended: list[int], relevant: set[int], top_k: int) -> float:
    dcg = sum(
        1.0 / np.log2(rank + 1)
        for rank, product_id in enumerate(recommended[:top_k], start=1)
        if product_id in relevant
    )
    ideal = min(top_k, len(relevant))
    idcg = sum(1.0 / np.log2(rank + 1) for rank in range(1, ideal + 1))
    return float(dcg / idcg) if idcg else 0.0


def _diversity(recommended: list[int], content: ContentModel) -> float:
    indexes = [content.item_index[product_id] for product_id in recommended if product_id in content.item_index]
    if len(indexes) < 2:
        return 0.0
    similarities = [
        float(content.similarity[left, right])
        for offset, left in enumerate(indexes)
        for right in indexes[offset + 1 :]
    ]
    return float(1.0 - (sum(similarities) / len(similarities))) if similarities else 0.0


def evaluate_candidates(
    bundle: ModelBundle,
    products: pd.DataFrame,
    history_events: pd.DataFrame,
    future_events: pd.DataFrame,
    as_of: pd.Timestamp,
    top_k: int,
) -> tuple[dict[str, dict[str, float]], int]:
    history = aggregate_events(history_events)
    relevant_by_user = _future_users(history, future_events)
    catalog_ids = set(products["product_id"].astype(int))
    configs = candidate_configs(bundle)
    rows: dict[str, list[dict[str, float]]] = {config.name: [] for config in configs}
    coverage_ids: dict[str, set[int]] = {config.name: set() for config in configs}
    for user_id, relevant in relevant_by_user.items():
        for config in configs:
            recommended = recommend_ids(
                config,
                bundle,
                user_id,
                history,
                as_of,
                catalog_ids,
                top_k,
            )
            coverage_ids[config.name].update(recommended)
            hits = sum(product_id in relevant for product_id in recommended)
            rows[config.name].append(
                {
                    "precision_at_k": hits / top_k,
                    "recall_at_k": hits / len(relevant),
                    "ndcg_at_k": _ndcg(recommended, relevant, top_k),
                    "diversity_at_k": _diversity(recommended, bundle.content),
                }
            )

    result: dict[str, dict[str, float]] = {}
    for config in configs:
        values = rows[config.name]
        if not values:
            result[config.name] = {
                "precision_at_k": 0.0,
                "recall_at_k": 0.0,
                "ndcg_at_k": 0.0,
                "coverage_at_k": 0.0,
                "diversity_at_k": 0.0,
                "evaluated_users": 0,
            }
            continue
        result[config.name] = {
            "precision_at_k": round(float(np.mean([row["precision_at_k"] for row in values])), 6),
            "recall_at_k": round(float(np.mean([row["recall_at_k"] for row in values])), 6),
            "ndcg_at_k": round(float(np.mean([row["ndcg_at_k"] for row in values])), 6),
            "coverage_at_k": round(float(len(coverage_ids[config.name]) / max(1, len(catalog_ids))), 6),
            "diversity_at_k": round(float(np.mean([row["diversity_at_k"] for row in values])), 6),
            "evaluated_users": len(values),
        }
    return result, len(relevant_by_user)


def _score_maps_for_artifact(
    bundle: ModelBundle,
    selected: CandidateConfig,
    products: pd.DataFrame,
    interactions: pd.DataFrame,
    as_of: pd.Timestamp,
) -> dict[str, dict[int, float]]:
    history = aggregate_events(interactions)
    users = sorted(history["user_id"].astype(str).unique())
    result: dict[str, dict[int, float]] = {}
    for user_id in users:
        result[user_id] = normalize_scores(
            _raw_scores(selected, bundle, user_id, history, as_of)
        )
    return result


def _model_state(bundle: ModelBundle, selected: CandidateConfig) -> dict[str, Any]:
    state: dict[str, Any] = {
        "algorithm": selected.name,
        "kind": selected.kind,
        "latent": selected.latent,
        "weights": selected.weights,
    }
    latent = bundle.als if selected.latent == "als" else bundle.bpr if selected.latent == "bpr" else None
    if latent is not None:
        state.update(
            {
                "user_ids": latent.user_ids,
                "item_ids": latent.item_ids,
                "user_index": latent.user_index,
                "item_index": latent.item_index,
                "user_factors": latent.user_factors,
                "item_factors": latent.item_factors,
                "factors": latent.factors,
            }
        )
    return state


def train_and_evaluate(
    *,
    products_path: str | Path,
    orders_path: str | Path,
    order_items_path: str | Path,
    ratings_path: str | Path | None,
    artifact_path: str | Path,
    metrics_path: str | Path,
    model_version: str | None = None,
    branch_id: int | None = None,
    validation_days: int = 30,
    test_days: int = 30,
    top_k: int = 5,
    random_state: int = 42,
) -> dict[str, Any]:
    split: TemporalSplit = load_training_data(
        products_path,
        orders_path,
        order_items_path,
        ratings_path=ratings_path,
        branch_id=branch_id,
        validation_days=validation_days,
        test_days=test_days,
    )
    train_interactions = aggregate_events(split.train)
    validation_interactions = aggregate_events(pd.concat([split.train, split.validation], ignore_index=True))
    train_bundle = fit_bundle(split.products, train_interactions, split.train_end, random_state=random_state)
    validation_results, validation_users = evaluate_candidates(
        train_bundle,
        split.products,
        split.train,
        split.validation,
        split.train_end,
        top_k,
    )
    selection_metric_key = "ndcg_at_k"
    selection_metric = f"NDCG@{top_k}"
    selected_name = max(
        validation_results,
        key=lambda name: (
            validation_results[name][selection_metric_key],
            validation_results[name]["recall_at_k"],
        ),
    )
    selected_config = next(config for config in candidate_configs(train_bundle) if config.name == selected_name)

    final_bundle = fit_bundle(
        split.products,
        validation_interactions,
        split.validation_end,
        random_state=random_state,
    )
    test_results, test_users = evaluate_candidates(
        final_bundle,
        split.products,
        pd.concat([split.train, split.validation], ignore_index=True),
        split.test,
        split.validation_end,
        top_k,
    )
    artifact_version = model_version or f"offline-{selected_name}-{fingerprint(split.products, split.events)}"
    scores_by_user = _score_maps_for_artifact(
        final_bundle,
        selected_config,
        split.products,
        pd.concat([split.train, split.validation], ignore_index=True),
        split.validation_end,
    )
    fallback_scores = normalize_scores(final_bundle.popularity.score_user("__anonymous__"))
    metadata = {
        "artifact_schema_version": ARTIFACT_SCHEMA_VERSION,
        "model_version": artifact_version,
        "algorithm": selected_name,
        "selection_metric": selection_metric,
        "data_source": split.source,
        "data_fingerprint": fingerprint(split.products, split.events),
        "status_filter": split.status_filter,
        "branch_id": branch_id,
        "train_end": split.train_end.isoformat(),
        "validation_end": split.validation_end.isoformat(),
        "latest_event": split.latest_event.isoformat(),
        "top_k": top_k,
        "validation_users": validation_users,
        "test_users": test_users,
        "validation_metrics": validation_results[selected_name],
        "test_metrics": test_results[selected_name],
        "candidate_count": len(validation_results),
        "unavailable_models": train_bundle.unavailable,
    }
    payload = {
        "metadata": metadata,
        "item_ids": split.products["product_id"].astype(int).tolist(),
        "scores_by_user": scores_by_user,
        "fallback_scores": fallback_scores,
        "model_state": _model_state(final_bundle, selected_config),
        "content_vectorizer": final_bundle.content.vectorizer,
        "content_item_ids": final_bundle.content.item_ids,
        "content_tfidf_matrix": final_bundle.content.tfidf_matrix,
    }
    saved_path = save_artifact(artifact_path, payload)
    report = {
        "artifact_path": str(saved_path),
        "selected_model": selected_name,
        "selection_metric": selection_metric,
        "data": {
            "source": split.source,
            "status_filter": split.status_filter,
            "data_fingerprint": metadata["data_fingerprint"],
            "products": int(len(split.products)),
            "events": int(len(split.events)),
            "users": int(split.events["user_id"].nunique()),
            "interactions": int(len(aggregate_events(split.events))),
            "train_events": int(len(split.train)),
            "validation_events": int(len(split.validation)),
            "test_events": int(len(split.test)),
            "train_end": metadata["train_end"],
            "validation_end": metadata["validation_end"],
            "latest_event": metadata["latest_event"],
        },
        "validation": {
            "evaluated_users": validation_users,
            "models": validation_results,
        },
        "test": {
            "evaluated_users": test_users,
            "models": test_results,
            "chosen_model_metrics": test_results[selected_name],
        },
        "unavailable_models": train_bundle.unavailable,
        "notes": [
            "Model selection used validation only; test metrics were not used to select the model.",
            "Relevance is a future purchase not already present in the user's training history.",
            "Unobserved items are not treated as negative feedback.",
            "The repository mock order data has no status column, so cancellation/payment filtering was unavailable for this run.",
            "Offline metrics do not establish online CTR, conversion or revenue impact.",
        ],
    }
    Path(metrics_path).parent.mkdir(parents=True, exist_ok=True)
    Path(metrics_path).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report
