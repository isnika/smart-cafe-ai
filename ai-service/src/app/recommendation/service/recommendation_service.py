from __future__ import annotations

import math
import logging
import threading
import time
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity

from src.app.recommendation.config import (
    RecommendationSettings,
    get_recommendation_settings,
)
from src.app.recommendation.features.features import (
    create_tfidf_features,
    create_user_item_matrix,
)
from src.app.recommendation.repository import (
    DEMO_DATA_DIR,
    DemoRecommendationRepository,
    OperationalRecommendationRepository,
    RecommendationRepository,
)
from src.app.recommendation.training.artifact import load_artifact, resolve_path


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RecommendationResult:
    items: list[dict]
    strategy: str
    fallback_reason: str | None = None


class RecommendationService:
    """Pre-fitted hybrid recommender backed by one data snapshot."""

    def __init__(
        self,
        data_dir: Path | None = None,
        repository: RecommendationRepository | None = None,
        recency_half_life_days: int = 60,
        max_quantity_signal: int = 8,
        max_order_signal: int = 20,
        trending_window_days: int = 30,
        as_of: pd.Timestamp | None = None,
        model_version: str = "demo",
        branch_id: int | None = None,
    ):
        runtime_settings = None
        load_offline_artifact = data_dir is None
        if repository is None:
            if data_dir is not None:
                repository = DemoRecommendationRepository(data_dir)
            else:
                runtime_settings = get_recommendation_settings()
                repository = self._repository_from_settings(runtime_settings)
                recency_half_life_days = runtime_settings.recency_half_life_days
                max_quantity_signal = runtime_settings.max_quantity_signal
                max_order_signal = runtime_settings.max_order_signal
                trending_window_days = runtime_settings.trending_window_days
                model_version = runtime_settings.model_version

        snapshot = repository.load_snapshot(branch_id=branch_id)
        self.source_version = snapshot.version
        self.snapshot_generated_at = snapshot.generated_at
        self.model_version = model_version
        self.products = self._available_products(snapshot.products)
        self.interactions = snapshot.interactions.copy()
        valid_ids = set(self.products["product_id"].astype(int))
        self.interactions = self.interactions[
            self.interactions["product_id"].isin(valid_ids)
        ].copy()

        if self.products.empty:
            raise ValueError("Recommendation catalog không có sản phẩm đang bán.")

        self.offline_artifact = None
        self.artifact_fallback_reason = None
        if load_offline_artifact:
            runtime_settings = runtime_settings or get_recommendation_settings()
            artifact_path = resolve_path(
                runtime_settings.artifact_path,
                base_dir=Path(__file__).resolve().parents[4],
            )
            try:
                self.offline_artifact = load_artifact(artifact_path)
                artifact_metadata = self.offline_artifact["metadata"]
                model_version = str(artifact_metadata["model_version"])
                self.model_version = model_version
                logger.info(
                    "Loaded recommendation artifact version=%s algorithm=%s path=%s",
                    model_version,
                    artifact_metadata.get("algorithm"),
                    artifact_path,
                )
            except FileNotFoundError:
                self.artifact_fallback_reason = "offline_artifact_missing"
                logger.info("Recommendation artifact chưa có; dùng baseline hiện tại: %s", artifact_path)
            except Exception as exc:
                self.artifact_fallback_reason = "offline_artifact_invalid"
                logger.warning(
                    "Không thể load recommendation artifact (%s); dùng baseline hiện tại",
                    type(exc).__name__,
                )

        self.tfidf_matrix = None
        self.vectorizer = None
        if self.offline_artifact is not None:
            try:
                self.vectorizer = self.offline_artifact["content_vectorizer"]
                self.tfidf_matrix = self.vectorizer.transform(self.products["content"])
            except Exception as exc:
                self.artifact_fallback_reason = "offline_artifact_content_schema_mismatch"
                self.offline_artifact = None
                self.model_version = runtime_settings.model_version
                logger.warning(
                    "Artifact recommendation không tương thích content schema (%s); fit baseline content",
                    type(exc).__name__,
                )
        if self.offline_artifact is None:
            self.tfidf_matrix, self.vectorizer = create_tfidf_features(self.products)
        self.content_similarity = cosine_similarity(self.tfidf_matrix)
        self.product_ids = self.products["product_id"].astype(int).tolist()
        self.product_index = {pid: idx for idx, pid in enumerate(self.product_ids)}
        self.product_lookup = {
            int(row.product_id): {
                "name": str(row.name),
                "category": str(row.category),
                "description": str(row.description),
                "price_vnd": int(row.price_vnd),
                "image": str(getattr(row, "image", "") or ""),
            }
            for row in self.products.itertuples(index=False)
        }

        self.user_item = (
            create_user_item_matrix(self.interactions)
            if not self.interactions.empty
            else pd.DataFrame()
        )
        self.item_similarity = (
            cosine_similarity(self.user_item.T) if not self.user_item.empty else None
        )
        self.item_ids = (
            [int(value) for value in self.user_item.columns]
            if not self.user_item.empty
            else []
        )
        self.item_index = {pid: index for index, pid in enumerate(self.item_ids)}
        self.popularity = (
            self.interactions.groupby("product_id")["quantity"].sum().to_dict()
            if not self.interactions.empty
            else {}
        )
        self.recency_half_life_days = max(1, int(recency_half_life_days))
        self.max_quantity_signal = max(1, int(max_quantity_signal))
        self.max_order_signal = max(1, int(max_order_signal))
        self.trending_window_days = max(1, int(trending_window_days))
        reference_time = as_of if as_of is not None else snapshot.generated_at
        self.as_of = (
            pd.Timestamp(reference_time).normalize()
            if reference_time is not None and not pd.isna(reference_time)
            else pd.Timestamp.now().normalize()
        )

    @staticmethod
    def _repository_from_settings(
        settings: RecommendationSettings,
    ) -> RecommendationRepository:
        if settings.source_mode == "demo":
            return DemoRecommendationRepository(DEMO_DATA_DIR)
        return OperationalRecommendationRepository(settings)

    @staticmethod
    def _available_products(products: pd.DataFrame) -> pd.DataFrame:
        result = products.copy()
        if "is_active" in result.columns:
            result = result[result["is_active"].fillna(False)]
        if "is_available" in result.columns:
            result = result[
                result["is_available"].isna()
                | result["is_available"].fillna(False)
            ]
        return result.reset_index(drop=True)

    @staticmethod
    def _normalize(scores: dict[int, float]) -> dict[int, float]:
        positive = {
            int(pid): max(0.0, float(score))
            for pid, score in scores.items()
            if float(score) > 0
        }
        if not positive:
            return {}
        high = max(positive.values())
        return {pid: score / high for pid, score in positive.items()} if high else {}

    def _user_history(self, user_id: str) -> pd.DataFrame:
        if self.interactions.empty:
            return self.interactions.copy()
        history = self.interactions[
            self.interactions["user_id"].astype(str) == str(user_id)
        ].copy()
        if history.empty:
            return history

        history["last_purchase"] = pd.to_datetime(history["last_purchase"], errors="coerce")
        age_days = (
            self.as_of - history["last_purchase"]
        ).dt.total_seconds().div(86400).fillna(365).clip(lower=0)
        recency = (
            0.5 ** (age_days / self.recency_half_life_days)
        ).clip(lower=0.05)

        quantity = history["quantity"].clip(lower=0, upper=self.max_quantity_signal)
        n_orders = history["n_orders"].clip(lower=0, upper=self.max_order_signal)
        strength = quantity.map(lambda value: math.log1p(float(value)))
        strength += 0.7 * n_orders.map(lambda value: math.log1p(float(value)))

        ratings = history["rating"]
        rating_factor = pd.Series(1.0, index=history.index)
        rating_factor.loc[ratings.notna() & (ratings >= 4)] = 1.25
        rating_factor.loc[ratings.notna() & (ratings <= 2)] = 0.55
        history["preference_weight"] = (strength + 0.1) * recency * rating_factor
        return history

    def _history_content_scores(self, history: pd.DataFrame) -> dict[int, float]:
        scores: dict[int, float] = {}
        for row in history.itertuples(index=False):
            source_id = int(row.product_id)
            if source_id not in self.product_index:
                continue
            similarities = self.content_similarity[self.product_index[source_id]]
            for index, candidate_id in enumerate(self.product_ids):
                if candidate_id == source_id:
                    continue
                similarity = float(similarities[index])
                if similarity > 0:
                    scores[candidate_id] = scores.get(candidate_id, 0.0) + (
                        similarity * float(row.preference_weight)
                    )
        return scores

    def _collaborative_scores(
        self,
        user_id: str,
        history: pd.DataFrame,
        top_k: int = 100,
    ) -> dict[int, float]:
        if (
            self.item_similarity is None
            or str(user_id) not in self.user_item.index
            or len(history) < 3
        ):
            return {}
        weights = {
            int(row.product_id): float(row.preference_weight)
            for row in history.itertuples(index=False)
        }
        purchased = set(weights)
        scores: dict[int, float] = {}
        for source_id, weight in weights.items():
            if source_id not in self.item_index:
                continue
            similarities = self.item_similarity[self.item_index[source_id]]
            for index, similarity in enumerate(similarities):
                candidate_id = self.item_ids[index]
                if candidate_id in purchased or similarity <= 0:
                    continue
                scores[candidate_id] = scores.get(candidate_id, 0.0) + (
                    float(similarity) * weight
                )
        return dict(
            sorted(scores.items(), key=lambda item: (-item[1], item[0]))[:top_k]
        )

    def _popular_scores(self) -> tuple[dict[int, float], bool]:
        if self.interactions.empty:
            return {}, False
        last_purchase = pd.to_datetime(self.interactions["last_purchase"], errors="coerce")
        recent = self.interactions[
            last_purchase >= self.as_of - pd.Timedelta(days=self.trending_window_days)
        ]
        if not recent.empty:
            return recent.groupby("product_id")["quantity"].sum().to_dict(), False
        return self.popularity, True

    def _item(
        self,
        product_id: int,
        score: float,
        reason_code: str,
        reason: str,
        strategy: str,
        recommendation_type: str,
    ) -> dict:
        product = self.product_lookup[product_id]
        return {
            "product_id": product_id,
            "name": product["name"],
            "category": product["category"],
            "price_vnd": product["price_vnd"],
            "image": product["image"],
            "score": round(float(score), 4),
            "reason_code": reason_code,
            "reason": reason,
            "strategy": strategy,
            "recommendation_type": recommendation_type,
        }

    @staticmethod
    def _sort(items: list[dict]) -> list[dict]:
        return sorted(items, key=lambda item: (-item["score"], item["product_id"]))

    @staticmethod
    def _diversify(items: list[dict], top_k: int) -> list[dict]:
        if len(items) <= top_k:
            return items
        selected: list[dict] = []
        deferred: list[dict] = []
        category_counts: dict[str, int] = {}
        for item in items:
            category = item["category"] or "__unknown__"
            if category_counts.get(category, 0) >= 2:
                deferred.append(item)
                continue
            selected.append(item)
            category_counts[category] = category_counts.get(category, 0) + 1
            if len(selected) == top_k:
                return selected
        return (selected + deferred)[:top_k]

    def _trending(
        self,
        top_k: int,
        exclude_ids: set[int] | None = None,
        fallback_reason: str | None = None,
    ) -> RecommendationResult:
        popular, used_all_time = self._popular_scores()
        popular_n = self._normalize(popular)
        exclude_ids = exclude_ids or set()
        items = [
            self._item(
                pid,
                score,
                "popular",
                "Được đặt nhiều gần đây tại quán."
                if not used_all_time
                else "Không có dữ liệu gần đây; món này nằm trong nhóm được đặt nhiều nhất.",
                "trending",
                "Trending",
            )
            for pid, score in popular_n.items()
            if pid in self.product_lookup and pid not in exclude_ids
        ]
        items = self._diversify(self._sort(items), top_k)
        reason = fallback_reason
        if used_all_time and reason is None:
            reason = "no_recent_activity"
        return RecommendationResult(items=items, strategy="trending", fallback_reason=reason)

    def _similar(self, product_id: int, top_k: int) -> RecommendationResult:
        row = self.content_similarity[self.product_index[product_id]]
        items = [
            self._item(
                candidate_id,
                float(row[index]),
                "similar_product",
                "Có đặc điểm tương tự món bạn đang xem.",
                "similar",
                "Content-Based",
            )
            for index, candidate_id in enumerate(self.product_ids)
            if candidate_id != product_id and float(row[index]) > 0
        ]
        items = self._diversify(self._sort(items), top_k)
        if items:
            return RecommendationResult(items=items, strategy="similar")
        return self._trending(
            top_k,
            exclude_ids={product_id},
            fallback_reason="no_similar_products",
        )

    def _personalized(
        self,
        user_id: str | None,
        product_id: int | None,
        top_k: int,
        discovery: bool,
    ) -> RecommendationResult:
        if self.offline_artifact is not None:
            trained_result = self._personalized_from_artifact(
                user_id=user_id,
                product_id=product_id,
                top_k=top_k,
                discovery=discovery,
            )
            if trained_result is not None:
                return trained_result
        if not user_id:
            return self._trending(top_k, fallback_reason="anonymous_user")
        history = self._user_history(user_id)
        if history.empty:
            return self._trending(top_k, fallback_reason="no_user_history")

        purchased_ids = set(history["product_id"].astype(int).tolist())
        content = self._history_content_scores(history)
        if product_id is not None:
            similarities = self.content_similarity[self.product_index[product_id]]
            for index, candidate_id in enumerate(self.product_ids):
                if candidate_id != product_id and similarities[index] > 0:
                    content[candidate_id] = content.get(candidate_id, 0.0) + (
                        float(similarities[index]) * 1.5
                    )

        collaborative = self._collaborative_scores(user_id, history)
        popular, popular_all_time = self._popular_scores()
        content_n = self._normalize(content)
        collaborative_n = self._normalize(collaborative)
        popular_n = self._normalize(popular)
        history_n = self._normalize(
            {
                int(row.product_id): float(row.preference_weight)
                for row in history.itertuples(index=False)
            }
        )
        candidate_ids = set(content_n) | set(collaborative_n) | set(popular_n)
        if discovery:
            candidate_ids -= purchased_ids
        else:
            # The normal personalized feed supports repeat purchases. Discovery
            # is the explicit mode that removes this history signal.
            candidate_ids |= purchased_ids

        if len(history) < 3:
            weights = (0.70, 0.00, 0.30)
        elif len(history) < 8:
            weights = (0.55, 0.25, 0.20)
        else:
            weights = (0.45, 0.45, 0.10)

        items: list[dict] = []
        for candidate_id in candidate_ids:
            if candidate_id not in self.product_lookup or candidate_id == product_id:
                continue
            has_content = candidate_id in content_n
            has_cf = candidate_id in collaborative_n
            has_history = candidate_id in history_n
            if has_content and has_cf:
                reason_code = "history_and_similar_users"
                reason = "Dựa trên lịch sử mua của bạn và xu hướng của khách có lịch sử tương tự."
                recommendation_type = "Hybrid-Personalized"
            elif has_content:
                reason_code = "history_content"
                reason = "Có đặc điểm gần với các món bạn từng chọn."
                recommendation_type = "History-Content"
            elif has_cf:
                reason_code = "similar_users"
                reason = "Được chọn bởi những khách có lịch sử mua tương tự."
                recommendation_type = "Collaborative"
            elif has_history:
                reason_code = "history_reorder"
                reason = "Bạn đã từng mua món này; điểm ưu tiên dựa trên tần suất và lần mua gần nhất."
                recommendation_type = "History-Reorder"
            else:
                reason_code = "popular"
                reason = (
                    "Được đặt nhiều gần đây tại quán."
                    if not popular_all_time
                    else "Không có dữ liệu gần đây; món này nằm trong nhóm được đặt nhiều nhất."
                )
                recommendation_type = "Trending"
            score = (
                weights[0] * content_n.get(candidate_id, 0.0)
                + weights[1] * collaborative_n.get(candidate_id, 0.0)
                + weights[2] * popular_n.get(candidate_id, 0.0)
            )
            if has_history and not has_content and not has_cf:
                score = 0.70 * history_n[candidate_id] + 0.30 * popular_n.get(candidate_id, 0.0)
            items.append(
                self._item(
                    candidate_id,
                    score,
                    reason_code,
                    reason,
                    "personalized",
                    recommendation_type,
                )
            )

        items = self._diversify(self._sort(items), top_k)
        if items:
            return RecommendationResult(items=items, strategy="personalized")
        return self._trending(
            top_k,
            exclude_ids=purchased_ids if discovery else None,
            fallback_reason="no_eligible_personalized_candidates",
        )

    def _personalized_from_artifact(
        self,
        user_id: str | None,
        product_id: int | None,
        top_k: int,
        discovery: bool,
    ) -> RecommendationResult | None:
        if not user_id or self.offline_artifact is None:
            return None
        raw_scores = self.offline_artifact.get("scores_by_user", {}).get(str(user_id))
        if not isinstance(raw_scores, dict):
            return None
        history = self._user_history(user_id)
        purchased_ids = set(history["product_id"].astype(int).tolist()) if not history.empty else set()
        algorithm = str(self.offline_artifact.get("metadata", {}).get("algorithm", "offline"))
        scores: dict[int, float] = {}
        for raw_product_id, raw_score in raw_scores.items():
            try:
                candidate_id = int(raw_product_id)
                candidate_score = float(raw_score)
            except (TypeError, ValueError):
                continue
            if (
                candidate_id in self.product_lookup
                and candidate_id != product_id
                and (not discovery or candidate_id not in purchased_ids)
                and candidate_score > 0
            ):
                scores[candidate_id] = candidate_score
        if not scores:
            return None
        items = [
            self._item(
                candidate_id,
                score,
                "offline_model",
                "Được xếp hạng bởi mô hình recommendation đã huấn luyện offline.",
                "personalized",
                f"Offline-{algorithm}",
            )
            for candidate_id, score in sorted(
                scores.items(), key=lambda item: (-item[1], item[0])
            )[:top_k]
        ]
        return RecommendationResult(
            items=self._diversify(items, top_k),
            strategy="personalized",
        )

    def _reorder(self, user_id: str | None, top_k: int) -> RecommendationResult:
        if not user_id:
            return self._trending(top_k, fallback_reason="reorder_requires_user")
        history = self._user_history(user_id)
        if history.empty:
            return self._trending(top_k, fallback_reason="no_user_history")
        scores = self._normalize(
            {
                int(row.product_id): float(row.preference_weight)
                for row in history.itertuples(index=False)
                if int(row.product_id) in self.product_lookup
            }
        )
        items = [
            self._item(
                product_id,
                score,
                "reorder_history",
                "Bạn đã từng mua món này; điểm ưu tiên dựa trên tần suất và lần mua gần nhất.",
                "reorder",
                "Reorder",
            )
            for product_id, score in scores.items()
        ]
        return RecommendationResult(
            items=self._diversify(self._sort(items), top_k),
            strategy="reorder",
        )

    def recommend_with_metadata(
        self,
        user_id: str | None = None,
        product_id: int | None = None,
        top_k: int = 5,
        mode: str | None = None,
        discovery: bool = False,
    ) -> RecommendationResult:
        if not 1 <= top_k <= 50:
            raise ValueError("top_k must be between 1 and 50")
        if product_id is not None and product_id not in self.product_index:
            raise ValueError(f"product_id={product_id} không tồn tại trong danh mục sản phẩm")

        effective_mode = mode
        if effective_mode is None:
            if product_id is not None and user_id is None:
                effective_mode = "similar"
            elif user_id is not None:
                effective_mode = "personalized"
            else:
                effective_mode = "trending"
        if effective_mode == "similar":
            if product_id is None:
                raise ValueError("mode=similar yêu cầu product_id")
            return self._similar(product_id, top_k)
        if effective_mode == "trending":
            return self._trending(top_k)
        if effective_mode == "reorder":
            return self._reorder(user_id, top_k)
        if effective_mode == "personalized":
            result = self._personalized(user_id, product_id, top_k, discovery)
            if self.artifact_fallback_reason and result.fallback_reason is None:
                return RecommendationResult(
                    items=result.items,
                    strategy=result.strategy,
                    fallback_reason=self.artifact_fallback_reason,
                )
            return result
        raise ValueError(f"mode không hợp lệ: {effective_mode}")

    def recommend(
        self,
        user_id: str | None = None,
        product_id: int | None = None,
        top_k: int = 5,
        mode: str | None = None,
        discovery: bool = False,
    ) -> list[dict]:
        return self.recommend_with_metadata(
            user_id=user_id,
            product_id=product_id,
            top_k=top_k,
            mode=mode,
            discovery=discovery,
        ).items


_SERVICE_CACHE: dict[int | None, tuple[float, RecommendationService]] = {}
_SERVICE_CACHE_LOCK = threading.Lock()


def get_recommendation_service(branch_id: int | None = None) -> RecommendationService:
    settings = get_recommendation_settings()
    now = time.monotonic()
    with _SERVICE_CACHE_LOCK:
        cached = _SERVICE_CACHE.get(branch_id)
        if cached and cached[0] > now:
            return cached[1]
        repository = RecommendationService._repository_from_settings(settings)
        service = RecommendationService(
            repository=repository,
            recency_half_life_days=settings.recency_half_life_days,
            max_quantity_signal=settings.max_quantity_signal,
            max_order_signal=settings.max_order_signal,
            trending_window_days=settings.trending_window_days,
            model_version=settings.model_version,
            branch_id=branch_id,
        )
        _SERVICE_CACHE[branch_id] = (now + settings.cache_ttl_seconds, service)
        return service


def clear_recommendation_service_cache(branch_id: int | None = None) -> None:
    with _SERVICE_CACHE_LOCK:
        if branch_id is None:
            _SERVICE_CACHE.clear()
        else:
            _SERVICE_CACHE.pop(branch_id, None)
