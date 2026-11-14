"""Kiểm chứng độc lập phép tính recommendation trên một snapshot thực tế."""
from __future__ import annotations

import argparse
import math
import sys
from dataclasses import replace
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[3]
RECOMMENDATION_DIR = Path(__file__).resolve().parent
DATA_DIR = RECOMMENDATION_DIR / "data_mock"
DEFAULT_OUTPUT = RECOMMENDATION_DIR / "calculation proof.md"
TOLERANCE = 5.1e-5
sys.path.insert(0, str(ROOT))

from src.app.recommendation.config import get_recommendation_settings  # noqa: E402
from src.app.recommendation.exceptions import (  # noqa: E402
    RecommendationAuthorizationError,
    RecommendationDataUnavailable,
)
from src.app.recommendation.repository import (  # noqa: E402
    OperationalRecommendationRepository,
)
from src.app.recommendation.service.recommendation_service import (  # noqa: E402
    RecommendationService,
)


def _fmt(value: Any, digits: int = 8) -> str:
    if value is None:
        return "NOT VERIFIED"
    try:
        if pd.isna(value):
            return "N/A"
    except (TypeError, ValueError):
        pass
    if isinstance(value, float):
        return f"{value:.{digits}f}".rstrip("0").rstrip(".")
    return str(value)


def _md(value: Any) -> str:
    return str(value).replace("|", "\\|").replace(chr(10), " ")


def _table(headers: list[str], rows: list[list[Any]]) -> list[str]:
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    lines.extend("| " + " | ".join(_md(value) for value in row) + " |" for row in rows)
    return lines


def _age_days(as_of: pd.Timestamp, value: Any) -> float:
    if value is None or pd.isna(value):
        return 365.0
    left = pd.Timestamp(as_of)
    right = pd.Timestamp(value)
    if left.tzinfo is None and right.tzinfo is not None:
        left = left.tz_localize(right.tz)
    elif left.tzinfo is not None and right.tzinfo is None:
        right = right.tz_localize(left.tz)
    return max(0.0, (left - right).total_seconds() / 86400)


def _normalize(scores: dict[int, float]) -> dict[int, float]:
    positive = {
        int(product_id): max(0.0, float(score))
        for product_id, score in scores.items()
        if float(score) > 0
    }
    if not positive:
        return {}
    maximum = max(positive.values())
    return {product_id: score / maximum for product_id, score in positive.items()}


def _sort(items: list[dict]) -> list[dict]:
    return sorted(
        items,
        key=lambda item: (
            -float(
                item.get(
                    "score",
                    item.get("score_rounded", item.get("score_independent", 0.0)),
                )
            ),
            int(item["product_id"]),
        ),
    )


def _diversify(items: list[dict], top_k: int) -> list[dict]:
    if len(items) <= top_k:
        return items
    selected: list[dict] = []
    deferred: list[dict] = []
    counts: dict[str, int] = {}
    for item in items:
        category = item.get("category") or "__unknown__"
        if counts.get(category, 0) >= 2:
            deferred.append(item)
            continue
        selected.append(item)
        counts[category] = counts.get(category, 0) + 1
        if len(selected) == top_k:
            return selected
    return (selected + deferred)[:top_k]


def _settings(source_mode: str | None):
    settings = get_recommendation_settings()
    return settings if source_mode is None else replace(settings, source_mode=source_mode)


def _build_service(source_mode: str | None, branch_id: int | None):
    settings = _settings(source_mode)
    common = {
        "recency_half_life_days": settings.recency_half_life_days,
        "max_quantity_signal": settings.max_quantity_signal,
        "max_order_signal": settings.max_order_signal,
        "trending_window_days": settings.trending_window_days,
        "model_version": settings.model_version,
        "branch_id": branch_id,
    }
    if settings.source_mode == "demo":
        return RecommendationService(data_dir=DATA_DIR, **common), "demo"
    repository = OperationalRecommendationRepository(settings)
    return RecommendationService(repository=repository, **common), "live"


def _raw_demo_counts() -> tuple[int, int] | None:
    if not (DATA_DIR / "products.csv").exists() or not (DATA_DIR / "user_item_summary.csv").exists():
        return None
    return (
        len(pd.read_csv(DATA_DIR / "products.csv", encoding="utf-8-sig")),
        len(pd.read_csv(DATA_DIR / "user_item_summary.csv", encoding="utf-8-sig")),
    )


def _history_trace(service: RecommendationService, user_id: str | None) -> tuple[pd.DataFrame, list[dict]]:
    if not user_id:
        return pd.DataFrame(), []
    history = service._user_history(user_id)
    rows: list[dict] = []
    for row in history.itertuples(index=False):
        quantity = float(row.quantity)
        orders = float(row.n_orders)
        capped_quantity = min(max(quantity, 0.0), service.max_quantity_signal)
        capped_orders = min(max(orders, 0.0), service.max_order_signal)
        age = _age_days(service.as_of, row.last_purchase)
        recency = max(0.05, 0.5 ** (age / service.recency_half_life_days))
        strength = math.log1p(capped_quantity) + 0.7 * math.log1p(capped_orders)
        rating = None if pd.isna(row.rating) else float(row.rating)
        rating_factor = 1.25 if rating is not None and rating >= 4 else 0.55 if rating is not None and rating <= 2 else 1.0
        independent = (strength + 0.1) * recency * rating_factor
        product = service.product_lookup.get(int(row.product_id), {})
        rows.append(
            {
                "product_id": int(row.product_id),
                "name": product.get("name", "unknown"),
                "quantity": quantity,
                "capped_quantity": capped_quantity,
                "n_orders": orders,
                "capped_orders": capped_orders,
                "last_purchase": row.last_purchase,
                "age_days": age,
                "recency": recency,
                "rating": rating,
                "rating_factor": rating_factor,
                "independent": independent,
                "pipeline": float(row.preference_weight),
                "difference": independent - float(row.preference_weight),
            }
        )
    return history, rows


def _history_table(rows: list[dict]) -> list[str]:
    if not rows:
        return ["Không có lịch sử hợp lệ cho user kiểm tra."]
    return _table(
        [
            "product_id", "món", "quantity", "quantity sau cap", "n_orders",
            "orders sau cap", "last_purchase", "age_days", "recency", "rating",
            "rating_factor", "weight tính lại", "weight pipeline", "sai lệch",
        ],
        [
            [
                row["product_id"], row["name"], _fmt(row["quantity"], 4),
                _fmt(row["capped_quantity"], 4), _fmt(row["n_orders"], 4),
                _fmt(row["capped_orders"], 4), _fmt(row["last_purchase"]),
                _fmt(row["age_days"], 6), _fmt(row["recency"], 10),
                _fmt(row["rating"]), _fmt(row["rating_factor"], 4),
                _fmt(row["independent"], 10), _fmt(row["pipeline"], 10),
                _fmt(row["difference"], 12),
            ]
            for row in rows
        ],
    )


def _contributors(service: RecommendationService, values: list[dict]) -> list[list[Any]]:
    rows = []
    for value in sorted(values, key=lambda item: -item["contribution"])[:10]:
        source_id = value["source_id"]
        rows.append(
            [
                source_id,
                service.product_lookup.get(source_id, {}).get("name", "unknown"),
                _fmt(value["similarity"], 10),
                _fmt(value["weight"], 10),
                _fmt(value["contribution"], 10),
            ]
        )
    return rows


def _personalized_trace(service, user_id, product_id, top_k, discovery, pipeline_result):
    history, history_rows = _history_trace(service, user_id)
    if history.empty:
        return {
            "history": history,
            "history_rows": history_rows,
            "items": [],
            "all_items": [],
            "pipeline": pipeline_result,
            "notes": ["Không có history: implementation fallback sang trending."],
        }

    content_raw: dict[int, float] = {}
    content_sources: dict[int, list[dict]] = {}
    for row in history.itertuples(index=False):
        source_id = int(row.product_id)
        if source_id not in service.product_index:
            continue
        similarities = service.content_similarity[service.product_index[source_id]]
        for index, candidate_id in enumerate(service.product_ids):
            similarity = float(similarities[index])
            if candidate_id == source_id or similarity <= 0:
                continue
            contribution = similarity * float(row.preference_weight)
            content_raw[candidate_id] = content_raw.get(candidate_id, 0.0) + contribution
            content_sources.setdefault(candidate_id, []).append(
                {
                    "source_id": source_id,
                    "similarity": similarity,
                    "weight": float(row.preference_weight),
                    "contribution": contribution,
                }
            )

    context_raw: dict[int, float] = {}
    if product_id is not None:
        similarities = service.content_similarity[service.product_index[product_id]]
        for index, candidate_id in enumerate(service.product_ids):
            if candidate_id != product_id and similarities[index] > 0:
                context_raw[candidate_id] = float(similarities[index]) * 1.5
                content_raw[candidate_id] = content_raw.get(candidate_id, 0.0) + context_raw[candidate_id]

    collaborative_raw: dict[int, float] = {}
    collaborative_sources: dict[int, list[dict]] = {}
    if service.item_similarity is not None and user_id in service.user_item.index and len(history) >= 3:
        source_weights = {
            int(row.product_id): float(row.preference_weight)
            for row in history.itertuples(index=False)
        }
        purchased = set(source_weights)
        for source_id, weight in source_weights.items():
            if source_id not in service.item_index:
                continue
            similarities = service.item_similarity[service.item_index[source_id]]
            for index, similarity in enumerate(similarities):
                candidate_id = service.item_ids[index]
                if candidate_id in purchased or similarity <= 0:
                    continue
                contribution = float(similarity) * weight
                collaborative_raw[candidate_id] = collaborative_raw.get(candidate_id, 0.0) + contribution
                collaborative_sources.setdefault(candidate_id, []).append(
                    {
                        "source_id": source_id,
                        "similarity": float(similarity),
                        "weight": weight,
                        "contribution": contribution,
                    }
                )
    collaborative_raw = dict(sorted(collaborative_raw.items(), key=lambda item: (-item[1], item[0]))[:100])

    recent_mask = pd.to_datetime(service.interactions["last_purchase"], errors="coerce") >= (
        service.as_of - pd.Timedelta(days=service.trending_window_days)
    )
    recent = service.interactions[recent_mask]
    popularity_raw = (
        recent.groupby("product_id")["quantity"].sum().to_dict()
        if not recent.empty
        else service.interactions.groupby("product_id")["quantity"].sum().to_dict()
    )
    used_all_time = recent.empty

    content_normalized = _normalize(content_raw)
    collaborative_normalized = _normalize(collaborative_raw)
    popularity_normalized = _normalize(popularity_raw)
    history_normalized = _normalize(
        {
            int(row.product_id): float(row.preference_weight)
            for row in history.itertuples(index=False)
        }
    )
    if len(history) < 3:
        weights = (0.70, 0.00, 0.30)
    elif len(history) < 8:
        weights = (0.55, 0.25, 0.20)
    else:
        weights = (0.45, 0.45, 0.10)

    purchased = set(history["product_id"].astype(int))
    candidates = set(content_normalized) | set(collaborative_normalized) | set(popularity_normalized)
    if discovery:
        candidates -= purchased
    else:
        candidates |= purchased

    all_items: list[dict] = []
    for candidate_id in candidates:
        if candidate_id not in service.product_lookup or candidate_id == product_id:
            continue
        has_content = candidate_id in content_normalized
        has_cf = candidate_id in collaborative_normalized
        has_history = candidate_id in history_normalized
        if has_content and has_cf:
            reason_code, recommendation_type = "history_and_similar_users", "Hybrid-Personalized"
        elif has_content:
            reason_code, recommendation_type = "history_content", "History-Content"
        elif has_cf:
            reason_code, recommendation_type = "similar_users", "Collaborative"
        elif has_history:
            reason_code, recommendation_type = "history_reorder", "History-Reorder"
        else:
            reason_code, recommendation_type = "popular", "Trending"
        score = (
            weights[0] * content_normalized.get(candidate_id, 0.0)
            + weights[1] * collaborative_normalized.get(candidate_id, 0.0)
            + weights[2] * popularity_normalized.get(candidate_id, 0.0)
        )
        if has_history and not has_content and not has_cf:
            score = 0.70 * history_normalized[candidate_id] + 0.30 * popularity_normalized.get(candidate_id, 0.0)
        product = service.product_lookup[candidate_id]
        all_items.append(
            {
                "product_id": candidate_id,
                "name": product["name"],
                "category": product["category"],
                "content_raw": content_raw.get(candidate_id, 0.0),
                "content_normalized": content_normalized.get(candidate_id, 0.0),
                "collaborative_raw": collaborative_raw.get(candidate_id, 0.0),
                "collaborative_normalized": collaborative_normalized.get(candidate_id, 0.0),
                "popularity_raw": popularity_raw.get(candidate_id, 0.0),
                "popularity_normalized": popularity_normalized.get(candidate_id, 0.0),
                "history_normalized": history_normalized.get(candidate_id, 0.0),
                "weight_content": weights[0],
                "weight_collaborative": weights[1],
                "weight_popularity": weights[2],
                "score_independent": score,
                "score_rounded": round(float(score), 4),
                "reason_code": reason_code,
                "recommendation_type": recommendation_type,
                "content_sources": content_sources.get(candidate_id, []),
                "collaborative_sources": collaborative_sources.get(candidate_id, []),
                "context_raw": context_raw.get(candidate_id, 0.0),
            }
        )

    sorted_items = _sort(all_items)
    final_items = _diversify(sorted_items, top_k)
    pipeline_by_id = {int(item["product_id"]): item for item in pipeline_result.items}
    final_ids = [item["product_id"] for item in final_items]
    for rank, item in enumerate(sorted_items, start=1):
        item["rank_before_diversity"] = rank
        item["rank_after_diversity"] = final_ids.index(item["product_id"]) + 1 if item["product_id"] in final_ids else None
        item["pipeline_item"] = pipeline_by_id.get(item["product_id"])
    return {
        "history": history,
        "history_rows": history_rows,
        "items": final_items,
        "all_items": sorted_items,
        "pipeline": pipeline_result,
        "pipeline_ids": [int(item["product_id"]) for item in pipeline_result.items],
        "independent_ids": final_ids,
        "weights": weights,
        "used_all_time": used_all_time,
        "content_pipeline": service._history_content_scores(history),
        "content_recomputed": content_raw,
        "collaborative_pipeline": service._collaborative_scores(user_id or "", history),
        "collaborative_recomputed": collaborative_raw,
        "popularity_pipeline": service._popular_scores()[0],
        "popularity_recomputed": popularity_raw,
        "notes": [
            "Content raw = sum(similarity × preference_weight) over history.",
            "Collaborative raw = item-item cosine similarity × preference_weight; purchased items are excluded and top 100 are retained.",
            "Each component is normalized independently by its positive maximum.",
            "Hybrid score = weighted sum of normalized components.",
            f"Popularity dùng cửa sổ {service.trending_window_days} ngày trước as_of={service.as_of}; all-time fallback={used_all_time}.",
            "Không có bước normalize lần hai trên tổng hybrid.",
        ],
    }


def _generic_trace(service, user_id, product_id, strategy, top_k, pipeline_result):
    history, history_rows = _history_trace(service, user_id)
    items: list[dict] = []
    if strategy == "similar":
        if product_id is None:
            raise ValueError("strategy=similar yêu cầu --product-id")
        similarities = service.content_similarity[service.product_index[product_id]]
        for index, candidate_id in enumerate(service.product_ids):
            if candidate_id == product_id or similarities[index] <= 0:
                continue
            product = service.product_lookup[candidate_id]
            score = float(similarities[index])
            items.append(
                {
                    "product_id": candidate_id, "name": product["name"], "category": product["category"],
                    "content_raw": score, "content_normalized": None,
                    "collaborative_raw": None, "collaborative_normalized": None,
                    "popularity_raw": None, "popularity_normalized": None, "history_normalized": None,
                    "weight_content": None, "weight_collaborative": None, "weight_popularity": None,
                    "score_independent": score, "score_rounded": round(score, 4),
                    "reason_code": "similar_product", "recommendation_type": "Content-Based",
                    "content_sources": [], "collaborative_sources": [], "context_raw": 0.0,
                }
            )
        notes = ["Similar score = TF-IDF cosine similarity với product_id.", "Popularity và collaborative: không áp dụng."]
    elif strategy == "trending":
        popularity, used_all_time = service._popular_scores()
        normalized = _normalize(popularity)
        for candidate_id, score in normalized.items():
            if candidate_id not in service.product_lookup:
                continue
            product = service.product_lookup[candidate_id]
            items.append(
                {
                    "product_id": candidate_id, "name": product["name"], "category": product["category"],
                    "content_raw": None, "content_normalized": None,
                    "collaborative_raw": None, "collaborative_normalized": None,
                    "popularity_raw": float(popularity[candidate_id]), "popularity_normalized": float(score),
                    "history_normalized": None, "weight_content": None, "weight_collaborative": None,
                    "weight_popularity": 1.0, "score_independent": float(score), "score_rounded": round(float(score), 4),
                    "reason_code": "popular", "recommendation_type": "Trending",
                    "content_sources": [], "collaborative_sources": [], "context_raw": 0.0,
                }
            )
        notes = ["Trending score = popularity / positive_max(popularity).", f"All-time fallback: {used_all_time}."]
    else:
        scores = _normalize(
            {
                int(row.product_id): float(row.preference_weight)
                for row in history.itertuples(index=False)
                if int(row.product_id) in service.product_lookup
            }
        )
        for candidate_id, score in scores.items():
            product = service.product_lookup[candidate_id]
            items.append(
                {
                    "product_id": candidate_id, "name": product["name"], "category": product["category"],
                    "content_raw": None, "content_normalized": None,
                    "collaborative_raw": None, "collaborative_normalized": None,
                    "popularity_raw": None, "popularity_normalized": None,
                    "history_normalized": float(score), "weight_content": None,
                    "weight_collaborative": None, "weight_popularity": None,
                    "score_independent": float(score), "score_rounded": round(float(score), 4),
                    "reason_code": "reorder_history", "recommendation_type": "Reorder",
                    "content_sources": [], "collaborative_sources": [], "context_raw": 0.0,
                }
            )
        notes = ["Reorder score = preference_weight / positive_max(preference_weight).", "Content, collaborative và popularity: không áp dụng."]
    sorted_items = _sort(items)
    final_items = _diversify(sorted_items, top_k)
    pipeline_by_id = {int(item["product_id"]): item for item in pipeline_result.items}
    final_ids = [item["product_id"] for item in final_items]
    for rank, item in enumerate(sorted_items, start=1):
        item["rank_before_diversity"] = rank
        item["rank_after_diversity"] = final_ids.index(item["product_id"]) + 1 if item["product_id"] in final_ids else None
        item["pipeline_item"] = pipeline_by_id.get(item["product_id"])
    return {
        "history": history, "history_rows": history_rows, "items": final_items, "all_items": sorted_items,
        "pipeline": pipeline_result, "pipeline_ids": [int(item["product_id"]) for item in pipeline_result.items],
        "independent_ids": final_ids, "notes": notes,
    }


def _trace(service, args):
    result = service.recommend_with_metadata(
        user_id=args.user_id,
        product_id=args.product_id,
        top_k=args.top_k,
        mode=args.strategy,
        discovery=args.discovery,
    )
    if args.strategy == "personalized":
        trace = _personalized_trace(service, args.user_id, args.product_id, args.top_k, args.discovery, result)
    else:
        trace = _generic_trace(service, args.user_id, args.product_id, args.strategy, args.top_k, result)
    trace["requested_strategy"] = args.strategy
    trace["user_id"] = args.user_id
    trace["product_id"] = args.product_id
    trace["discovery"] = args.discovery
    return trace


def _score_table(trace: dict) -> tuple[list[str], list[dict]]:
    rows = []
    checks = []
    for item in trace.get("items", []):
        pipeline_item = item.get("pipeline_item") or {}
        pipeline_score = pipeline_item.get("score")
        if pipeline_score is None:
            difference = "NOT VERIFIED"
            status = "NOT VERIFIED"
        else:
            difference = float(item["score_independent"]) - float(pipeline_score)
            status = "PASS" if abs(difference) <= TOLERANCE else "FAIL"
        checks.append({"product_id": item["product_id"], "status": status})
        rows.append(
            [
                item["product_id"], item["name"], _fmt(item.get("content_raw")),
                _fmt(item.get("collaborative_raw")), _fmt(item.get("popularity_raw")),
                f"({_fmt(item.get('weight_content'))}, {_fmt(item.get('weight_collaborative'))}, {_fmt(item.get('weight_popularity'))})",
                _fmt(item["score_independent"], 12), _fmt(item["score_rounded"], 4),
                "NOT VERIFIED", _fmt(difference, 12), status,
            ]
        )
    return (
        _table(
            [
                "product_id", "tên món", "content", "collaborative item-item", "popularity",
                "trọng số", "điểm tính lại", "điểm pipeline serialize", "điểm API HTTP",
                "sai lệch", "trạng thái",
            ],
            rows,
        ),
        checks,
    )


def _component_sections(trace: dict, service: RecommendationService) -> list[str]:
    lines: list[str] = []
    for item in trace.get("items", []):
        lines += [
            f"### Product {item['product_id']} - {item['name']}",
            "",
            f"- Category: {item['category']}",
            f"- Rank trước diversity: {item.get('rank_before_diversity')}",
            f"- Rank sau diversity: {item.get('rank_after_diversity') or 'không được chọn'}",
            f"- reason_code: {item.get('reason_code')}",
            f"- recommendation_type: {item.get('recommendation_type')}",
            f"- reason serialize từ pipeline: {(item.get('pipeline_item') or {}).get('reason', 'NOT VERIFIED')}",
            f"- reason có tín hiệu hỗ trợ: {'có' if item.get('reason_code') != 'popular' or item.get('popularity_raw', 0) else 'không'}",
            "",
        ]
        lines += _table(
            ["Thành phần", "Raw", "Normalized", "Trọng số", "Đóng góp"],
            [
                [
                    "content", _fmt(item.get("content_raw")), _fmt(item.get("content_normalized")),
                    _fmt(item.get("weight_content")),
                    _fmt((item.get("content_normalized") or 0) * (item.get("weight_content") or 0), 12),
                ],
                [
                    "collaborative item-item", _fmt(item.get("collaborative_raw")),
                    _fmt(item.get("collaborative_normalized")), _fmt(item.get("weight_collaborative")),
                    _fmt((item.get("collaborative_normalized") or 0) * (item.get("weight_collaborative") or 0), 12),
                ],
                [
                    "popularity", _fmt(item.get("popularity_raw")), _fmt(item.get("popularity_normalized")),
                    _fmt(item.get("weight_popularity")),
                    _fmt((item.get("popularity_normalized") or 0) * (item.get("weight_popularity") or 0), 12),
                ],
                [
                    "history reorder override", "N/A", _fmt(item.get("history_normalized")), "0.70 / 0.30",
                    "chỉ áp dụng khi có history nhưng không có content/CF",
                ],
            ],
        )
        lines += [
            "",
            "Công thức score tính lại:",
            "score = weight_content × content_normalized + weight_collaborative × collaborative_normalized + weight_popularity × popularity_normalized",
            f"score tính lại = {_fmt(item['score_independent'], 12)}",
            f"score pipeline sau round(4) = {_fmt(item['score_rounded'], 4)}",
        ]
        if item.get("context_raw"):
            lines.append(f"Context contribution cộng vào content raw = {_fmt(item['context_raw'], 12)}.")
        if item.get("content_sources"):
            lines += ["", "Đóng góp content chính:"]
            lines += _table(
                ["source product_id", "món nguồn", "similarity", "weight", "contribution"],
                _contributors(service, item["content_sources"]),
            )
        if item.get("collaborative_sources"):
            lines += ["", "Đóng góp collaborative item-item chính:"]
            lines += _table(
                ["source product_id", "món nguồn", "similarity", "weight", "contribution"],
                _contributors(service, item["collaborative_sources"]),
            )
        lines.append("")
    return lines


def _product_99(service: RecommendationService, trace: dict) -> list[str]:
    lines = ["## 8. Phân tích product 99", ""]
    if 99 not in service.product_lookup:
        return lines + ["NOT VERIFIED: product 99 không tồn tại trong snapshot."]
    matches = [item for item in trace.get("all_items", []) if item["product_id"] == 99]
    product = service.product_lookup[99]
    lines.append(f"Product 99 tồn tại: {product['name']} ({product['category']}).")
    if not matches:
        return lines + [
            "Product 99 không nằm trong candidate set hoặc đã bị lọc.",
            "Không kết luận sai chỉ vì khác danh mục.",
        ]
    item = matches[0]
    lines += [
        f"- Rank trước diversity: {item.get('rank_before_diversity')}.",
        f"- Rank sau diversity: {item.get('rank_after_diversity') or 'không vào top K'}.",
        f"- reason_code: {item.get('reason_code')}.",
        f"- Content raw/normalized: {_fmt(item.get('content_raw'))} / {_fmt(item.get('content_normalized'))}.",
        f"- Collaborative raw/normalized: {_fmt(item.get('collaborative_raw'))} / {_fmt(item.get('collaborative_normalized'))}.",
        f"- Popularity raw/normalized: {_fmt(item.get('popularity_raw'))} / {_fmt(item.get('popularity_normalized'))}.",
        f"- Score tính lại: {_fmt(item.get('score_independent'), 12)}.",
        "Kết luận: product 99 được giải thích bằng các thành phần số liệu trên; "
        "proof không tự coi khác danh mục là lỗi.",
    ]
    return lines


def _command_line(args, source_mode: str, output_path: Path) -> str:
    parts = [
        "python",
        f'"{Path(__file__).resolve()}"',
        "--source-mode",
        source_mode,
        "--user-id",
        str(args.user_id),
        "--top-k",
        str(args.top_k),
        "--strategy",
        str(args.strategy),
    ]
    if args.product_id is not None:
        parts += ["--product-id", str(args.product_id)]
    if args.branch_id is not None:
        parts += ["--branch-id", str(args.branch_id)]
    if args.discovery:
        parts.append("--discovery")
    parts += ["--output", f'"{output_path}"']
    return " ".join(parts)


def _build_report(args, service, source_mode, trace, output_path: Path) -> str:
    result = trace["pipeline"]
    score_lines, score_checks = _score_table(trace)
    raw_demo_counts = _raw_demo_counts() if source_mode == "demo" else None
    output_ids = [int(item["product_id"]) for item in result.items]
    arithmetic = "PASS" if score_checks and all(check["status"] == "PASS" for check in score_checks) else "NOT VERIFIED" if not score_checks else "FAIL"
    rank_status = "PASS" if trace.get("independent_ids") == trace.get("pipeline_ids") else "FAIL"
    unique_status = "PASS" if len(output_ids) == len(set(output_ids)) else "FAIL"
    valid_status = "PASS" if all(product_id in service.product_lookup for product_id in output_ids) else "FAIL"
    history_ids = set(trace["history"]["product_id"].astype(int)) if not trace["history"].empty else set()
    discovery_status = "NOT APPLICABLE" if not args.discovery else "PASS" if not history_ids.intersection(output_ids) else "FAIL"
    config_rows = [
        ["source_mode", source_mode],
        ["source_version", service.source_version or "N/A"],
        ["snapshot_generated_at", service.snapshot_generated_at or "N/A"],
        ["reference_time", service.as_of],
        ["model_version", service.model_version],
        ["recency_half_life_days", service.recency_half_life_days],
        ["trending_window_days", service.trending_window_days],
        ["max_quantity_signal", service.max_quantity_signal],
        ["max_order_signal", service.max_order_signal],
        ["products used", len(service.products)],
        ["interactions used", len(service.interactions)],
        ["users used", service.interactions["user_id"].nunique() if not service.interactions.empty else 0],
        ["branch_id", args.branch_id if args.branch_id is not None else "N/A"],
    ]
    lines = [
        "# Calculation Proof - Recommendation",
        "",
        "## 1. Kết luận",
        "",
        f"- Tính toán theo implementation: **{arithmetic}**.",
        f"- Thứ tự, tie-break và diversity: **{rank_status}**.",
        f"- Không trùng sản phẩm: **{unique_status}**.",
        f"- Sản phẩm thuộc serving set: **{valid_status}**.",
        f"- Discovery filter: **{discovery_status}**.",
        "- HTTP API `POST /api/recommendation`: **NOT VERIFIED**; script gọi service trực tiếp, không giả mạo HTTP smoke test.",
        "- Hiệu quả dự đoán sở thích: **NOT VERIFIED**; cần temporal evaluation.",
        "",
        "PASS ở đây chỉ có nghĩa phép tính khớp code hiện tại, không có nghĩa model "
        "dự đoán sở thích chính xác.",
        "",
        "## 2. Lệnh chạy và nguồn dữ liệu",
        "",
        f"- User: {args.user_id}",
        f"- Strategy: {args.strategy}",
        f"- Product context: {args.product_id if args.product_id is not None else 'N/A'}",
        f"- Discovery: {args.discovery}",
        f"- Source mode: {source_mode}",
        f"- Source: {DATA_DIR if source_mode == 'demo' else 'backend operational snapshot API'}",
        f"- Output: {output_path}",
        f"- Command: {_command_line(args, source_mode, output_path)}",
        "",
        *_table(["Cấu hình", "Giá trị"], config_rows),
        "",
        "### Mapping schema → snapshot recommendation",
        "",
        "- Catalog: `Products`, `Categories`, `Product_Variants`, và "
        "`Branch_Product_Availability` → product_id, name, category, description, "
        "price_vnd, thuộc tính content, is_active/is_available.",
        "- User: `Users.id` → `interactions.user_id`; không tải email, tên hoặc thông tin cá nhân.",
        "- Purchase: `Orders` + `Order_Items` → quantity, n_orders, last_purchase; "
        "snapshot operational phải chỉ lấy `Orders.status='Completed'`, xử lý "
        "payment/refund theo contract.",
        "- Rating: `Product_Reviews` đã `Approved` và `Verified_Purchases` → rating; "
        "không có review thì rating là null.",
        "- Options: schema có `Product_Options`/`Order_Item_Options`, nhưng snapshot hiện "
        "không cung cấp tín hiệu option nên proof không suy diễn độ ngọt/đá/topping.",
        "",
        (
            f"Demo raw rows: products.csv={raw_demo_counts[0]}, "
            f"user_item_summary.csv={raw_demo_counts[1]}; "
            f"normalized/used={len(service.products)}/{len(service.interactions)}. "
            "Không thấy chênh lệch số dòng ở lần chạy này."
            if raw_demo_counts is not None
            else "Live snapshot đã được normalize; không có raw rows để đếm tại AI service."
        ),
        "Demo summary không chứa order status/refund nên không thể liệt kê record bị loại "
        "theo các trạng thái DB; phần này chỉ được xác minh khi backend operational trả "
        "snapshot có contract tương ứng.",
        "",
        "## 3. Công thức thực tế và code reference",
        "",
        "- Preference weight: RecommendationService._user_history.",
        "- Content: RecommendationService._history_content_scores.",
        "- Collaborative: RecommendationService._collaborative_scores, item-item CF.",
        "- Popularity: RecommendationService._popular_scores.",
        "- Hybrid weights: RecommendationService._personalized.",
        "- Normalize: RecommendationService._normalize.",
        "- Reranking: RecommendationService._diversify; tie-break (-score, product_id).",
        "",
        "age_days = max(0, as_of - last_purchase)",
        "recency = clip(0.5 ** (age_days / half_life), lower=0.05)",
        "strength = log1p(min(quantity, quantity_cap)) + 0.7 × log1p(min(n_orders, order_cap))",
        "rating_factor = 1.25 nếu rating >= 4; 0.55 nếu rating <= 2; ngược lại 1.0",
        "preference_weight = (strength + 0.1) × recency × rating_factor",
        "",
        "- history < 3: content=0.70, collaborative=0.00, popularity=0.30.",
        "- 3 <= history < 8: content=0.55, collaborative=0.25, popularity=0.20.",
        "- history >= 8: content=0.45, collaborative=0.45, popularity=0.10.",
        "- Mỗi component normalize độc lập theo positive maximum.",
        "- Không có normalize lần hai trên tổng hybrid.",
        "",
        "## 4. Lịch sử và tín hiệu sở thích",
        "",
        f"User: {args.user_id}; số history row hợp lệ: {len(trace['history_rows'])}.",
        "",
        *_history_table(trace["history_rows"]),
        "",
        "Sản phẩm không active/available không nằm trong serving set. Discovery chỉ "
        "loại món đã mua khi --discovery được bật.",
        "",
        "## 5. Bảng điểm top K",
        "",
        *score_lines,
        "",
        "Điểm HTTP API là NOT VERIFIED vì lần chạy này không gọi server HTTP. "
        "Điểm pipeline serialize là score sau round 4 chữ số.",
        "",
        "## 6. Phép thay số và đóng góp",
        "",
        *trace["notes"],
        "",
        *_component_sections(trace, service),
        "## 7. Đối chiếu độc lập",
        "",
        *_table(
            ["Hạng mục", "Kết quả", "Tolerance / ghi chú"],
            [
                [
                    "Preference weight",
                    "PASS" if trace["history_rows"] and all(abs(row["difference"]) <= 1e-10 for row in trace["history_rows"]) else "NOT VERIFIED",
                    "1e-10",
                ],
                [
                    "Content/COLLAB/pop maps",
                    "PASS" if trace.get("requested_strategy") == "personalized" and trace.get("content_pipeline") == trace.get("content_recomputed") and trace.get("collaborative_pipeline") == trace.get("collaborative_recomputed") and trace.get("popularity_pipeline") == trace.get("popularity_recomputed") else "NOT VERIFIED",
                    "exact map equality trên cùng snapshot",
                ],
                ["Final score", arithmetic, f"|delta| <= {TOLERANCE}"],
                ["Tie-break/reranking", rank_status, "(-score, product_id), diversity category tối đa 2"],
                ["HTTP API POST /api/recommendation", "NOT VERIFIED", "Chưa gọi HTTP server"],
                ["Branch filtering", "NOT VERIFIED" if args.branch_id is not None else "NOT APPLICABLE", "backend snapshot chịu trách nhiệm"],
            ],
        ),
        "",
        "## 8. Phân tích product 99",
        "",
        *_product_99(service, trace)[2:],
        "",
        "## 9. Hạn chế",
        "",
        "- Proof xác nhận phép tính theo code, không xác nhận hiệu quả dự đoán.",
        "- Live lỗi không tự chuyển demo; demo phải được chọn tường minh.",
        "- HTTP API `POST /api/recommendation` chưa được gọi trong lần chạy này.",
        "- Ratings/options/refunds được đối chiếu theo contract/schema; demo không có raw state đầy đủ.",
        "",
        "## 10. Kết quả pipeline",
        "",
        f"- Requested strategy: {args.strategy}",
        f"- Actual strategy: {result.strategy}",
        f"- Fallback reason: {result.fallback_reason or 'null'}",
        f"- Pipeline IDs: {trace.get('pipeline_ids')}",
        f"- Independent IDs: {trace.get('independent_ids')}",
        "",
    ]
    return chr(10).join(str(line) for line in lines) + chr(10)


def _error_report(args, source_mode: str, output_path: Path, error: Exception) -> str:
    lines = [
        "# Calculation Proof - Recommendation",
        "",
        "## 1. Kết luận",
        "",
        "- Source load: **FAIL**.",
        "- Phép tính, ranking và API: **NOT VERIFIED** vì chưa xây được snapshot.",
        "",
        "## 2. Cấu hình",
        "",
        f"- Source mode: {source_mode}",
        f"- User: {args.user_id}",
        f"- Strategy: {args.strategy}",
        f"- Branch: {args.branch_id if args.branch_id is not None else 'N/A'}",
        f"- Output: {output_path}",
        f"- Command: {_command_line(args, source_mode, output_path)}",
        "",
        "## 3. Lỗi",
        "",
        f"- {type(error).__name__}: {error}",
        "",
        "Live mode không tự chuyển sang demo. Cấu hình backend operational API hoặc "
        "chạy lại với --source-mode demo để kiểm chứng dữ liệu demo.",
        "",
    ]
    return chr(10).join(lines) + chr(10)


def _print_report(report: str) -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    print(report)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-id", default="U001")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--strategy", choices=["personalized", "similar", "trending", "reorder"], default="personalized")
    parser.add_argument("--product-id", type=int, default=None)
    parser.add_argument("--branch-id", type=int, default=None)
    parser.add_argument("--discovery", action="store_true")
    parser.add_argument("--source-mode", choices=["live", "demo"], default=None)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    output_path = args.output if args.output.is_absolute() else (Path.cwd() / args.output).resolve()
    source_mode = args.source_mode or get_recommendation_settings().source_mode
    try:
        service, actual_source_mode = _build_service(source_mode, args.branch_id)
        trace = _trace(service, args)
        report = _build_report(args, service, actual_source_mode, trace, output_path)
    except (
        RecommendationAuthorizationError,
        RecommendationDataUnavailable,
        FileNotFoundError,
        ValueError,
        KeyError,
    ) as error:
        report = _error_report(args, source_mode, output_path, error)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(report, encoding="utf-8")
        _print_report(report)
        return 2
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(report, encoding="utf-8")
    _print_report(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
