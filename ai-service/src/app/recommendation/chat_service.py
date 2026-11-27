"""Recommendation facade used by the chatbot tool.

The existing ``RecommendationService`` remains the public recommendation API
implementation.  This facade adds the chat-specific contract: use a
precomputed artifact when it contains the requested user, then use local
seven-day/all-time fallbacks.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

from src.app.recommendation.fallback import DEFAULT_DATA_DIR, RecommendationFallback
from src.app.recommendation.repository import DemoRecommendationRepository
from src.app.recommendation.service.recommendation_service import RecommendationService

logger = logging.getLogger(__name__)


def _limit(value: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = 5
    return max(1, min(parsed, 50))


def _public_item(item: dict[str, Any], lookup: dict[int, dict[str, Any]] | None = None) -> dict[str, Any]:
    product_id = int(item.get("product_id", item.get("id")))
    product = (lookup or {}).get(product_id, {})
    price = item.get("price_vnd", item.get("price", product.get("price_vnd")))
    result: dict[str, Any] = {
        "id": product_id,
        "product_id": product_id,
        "name": str(item.get("name", product.get("name", ""))),
        "price": int(price) if price is not None else None,
        "price_vnd": int(price) if price is not None else None,
        "description": str(item.get("description", product.get("description", "")) or ""),
        "category": str(item.get("category", product.get("category", "")) or ""),
        "image": str(item.get("image", product.get("image", "")) or ""),
    }
    for field in ("score", "sales_quantity", "order_count"):
        if field in item:
            result[field] = item[field]
    return result


class ChatRecommendationService:
    def __init__(
        self,
        *,
        offline_service: RecommendationService | None = None,
        fallback: RecommendationFallback | None = None,
        data_dir: Path | None = None,
    ):
        local_data_dir = data_dir or DEFAULT_DATA_DIR
        self._offline_service = offline_service
        self._fallback = fallback or RecommendationFallback(data_dir=local_data_dir)
        self._data_dir = local_data_dir

    def _get_offline_service(self) -> RecommendationService:
        if self._offline_service is None:
            # Supplying the demo repository keeps this chat-only path local,
            # while data_dir=None makes the existing service load the artifact.
            self._offline_service = RecommendationService(
                repository=DemoRecommendationRepository(self._data_dir)
            )
        return self._offline_service

    def _personalized(self, user_id: str, limit: int) -> list[dict[str, Any]]:
        service = self._get_offline_service()
        artifact = getattr(service, "offline_artifact", None)
        score_maps = artifact.get("scores_by_user", {}) if isinstance(artifact, dict) else {}
        raw_scores = score_maps.get(str(user_id)) if isinstance(score_maps, dict) else None
        if not isinstance(raw_scores, dict) or not raw_scores:
            return []

        result = service.recommend_with_metadata(
            user_id=str(user_id),
            top_k=limit,
            mode="personalized",
            discovery=True,
        )
        if result.strategy != "personalized" or not result.items:
            return []
        lookup = getattr(service, "product_lookup", {})
        unique: list[dict[str, Any]] = []
        seen: set[int] = set()
        for item in result.items:
            product_id = int(item.get("product_id", item.get("id")))
            if product_id in seen:
                continue
            seen.add(product_id)
            unique.append(_public_item(item, lookup))
        return unique[:limit]

    def get_recommendations(self, user_id: str | None, limit: int = 5) -> dict[str, Any]:
        limit = _limit(limit)
        normalized_user_id = str(user_id).strip() if user_id is not None and str(user_id).strip() else None

        if normalized_user_id:
            try:
                items = self._personalized(normalized_user_id, limit)
                if items:
                    logger.info(
                        "Chat recommendation source=personalized user_present=true items=%d",
                        len(items),
                    )
                    return {"source": "personalized", "items": items}
                logger.info("Chat recommendation personalized unavailable; using fallback")
            except Exception as exc:
                logger.warning(
                    "Không đọc được recommendation artifact; dùng fallback (error_type=%s)",
                    type(exc).__name__,
                )

        try:
            trending = self._fallback.trending(limit)
            if trending:
                logger.info("Chat recommendation source=trending items=%d", len(trending))
                return {"source": "trending", "items": trending[:limit]}
        except Exception as exc:
            logger.warning(
                "Không tính được trending; thử best_seller (error_type=%s)",
                type(exc).__name__,
            )

        try:
            best_sellers = self._fallback.best_sellers(limit)
            logger.info("Chat recommendation source=best_seller items=%d", len(best_sellers))
            return {"source": "best_seller", "items": best_sellers[:limit]}
        except Exception as exc:
            logger.exception("Không đọc được fallback recommendation (error_type=%s)", type(exc).__name__)
            return {"source": "best_seller", "items": []}


_SERVICE: ChatRecommendationService | None = None
_SERVICE_LOCK = threading.Lock()


def get_chat_recommendation_service() -> ChatRecommendationService:
    global _SERVICE
    with _SERVICE_LOCK:
        if _SERVICE is None:
            _SERVICE = ChatRecommendationService()
        return _SERVICE


def get_recommendations(user_id: str | None, limit: int = 5) -> dict[str, Any]:
    """Return the contract consumed by the chatbot recommendation tool."""

    return get_chat_recommendation_service().get_recommendations(user_id, limit)


def clear_chat_recommendation_service() -> None:
    global _SERVICE
    with _SERVICE_LOCK:
        _SERVICE = None
