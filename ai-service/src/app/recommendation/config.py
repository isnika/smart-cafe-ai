from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

from src.app.core.config import get_settings


def _int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(value, maximum))


def _float(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(value, maximum))


@dataclass(frozen=True)
class RecommendationSettings:
    """Runtime settings for recommendation data and snapshot refreshes.

    ``live`` is deliberately the default.  Demo CSVs are only loaded when the
    operator explicitly sets ``RECOMMENDATION_SOURCE_MODE=demo``.
    """

    source_mode: str
    data_api_base_url: str
    data_api_key: str
    data_api_timeout_seconds: float
    snapshot_path: str
    viewer_path: str
    cache_ttl_seconds: int
    recency_half_life_days: int
    trending_window_days: int
    max_quantity_signal: int
    max_order_signal: int
    model_version: str

    @classmethod
    def from_env(cls) -> "RecommendationSettings":
        base = get_settings()
        source_mode = os.getenv("RECOMMENDATION_SOURCE_MODE", "live").strip().lower()
        if source_mode not in {"live", "demo"}:
            source_mode = "live"
        return cls(
            source_mode=source_mode,
            data_api_base_url=base.data_api_base_url,
            data_api_key=base.data_api_key,
            data_api_timeout_seconds=base.data_api_timeout_seconds,
            snapshot_path=os.getenv(
                "RECOMMENDATION_SNAPSHOT_PATH",
                "/api/ai/recommendation/snapshot",
            ).strip(),
            viewer_path=os.getenv(
                "RECOMMENDATION_VIEWER_PATH",
                "/api/ai/recommendation/viewer",
            ).strip(),
            cache_ttl_seconds=_int("RECOMMENDATION_CACHE_TTL_SECONDS", 300, 1, 86_400),
            recency_half_life_days=_int("RECOMMENDATION_RECENCY_HALF_LIFE_DAYS", 60, 1, 3650),
            trending_window_days=_int("RECOMMENDATION_TRENDING_WINDOW_DAYS", 30, 1, 3650),
            max_quantity_signal=_int("RECOMMENDATION_MAX_QUANTITY_SIGNAL", 8, 1, 1000),
            max_order_signal=_int("RECOMMENDATION_MAX_ORDER_SIGNAL", 20, 1, 1000),
            model_version=os.getenv("RECOMMENDATION_MODEL_VERSION", "hybrid-v2").strip()
            or "hybrid-v2",
        )


@lru_cache(maxsize=1)
def get_recommendation_settings() -> RecommendationSettings:
    return RecommendationSettings.from_env()
