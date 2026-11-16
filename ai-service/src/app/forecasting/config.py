from __future__ import annotations

import os
from dataclasses import dataclass


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
class ForecastingSettings:
    source_mode: str
    data_api_base_url: str
    data_api_key: str
    data_api_timeout_seconds: float
    snapshot_path: str
    timezone: str
    cache_ttl_seconds: int
    model_version: str
    evaluation_initial_days: int
    evaluation_horizon_days: int
    evaluation_folds: int
    evaluation_step_days: int

    @classmethod
    def from_env(cls) -> "ForecastingSettings":
        source_mode = os.getenv("FORECASTING_SOURCE_MODE", "live").strip().lower()
        if source_mode not in {"live", "demo"}:
            source_mode = "live"
        base_url = os.getenv(
            "FORECASTING_DATA_API_BASE_URL",
            os.getenv("DATA_API_BASE_URL", ""),
        ).strip().rstrip("/")
        api_key = os.getenv(
            "FORECASTING_DATA_API_KEY",
            os.getenv("DATA_API_KEY", ""),
        ).strip()
        return cls(
            source_mode=source_mode,
            data_api_base_url=base_url,
            data_api_key=api_key,
            data_api_timeout_seconds=_float(
                "FORECASTING_DATA_API_TIMEOUT_SECONDS", 3.0, 0.2, 30.0
            ),
            snapshot_path=os.getenv(
                "FORECASTING_SNAPSHOT_PATH", "/api/ai/forecasting/snapshot"
            ).strip(),
            timezone=os.getenv(
                "FORECASTING_TIMEZONE", "Asia/Ho_Chi_Minh"
            ).strip(),
            cache_ttl_seconds=_int("FORECASTING_CACHE_TTL_SECONDS", 300, 1, 86_400),
            model_version=os.getenv(
                "FORECASTING_MODEL_VERSION", "revenue-forecast-v3"
            ).strip(),
            evaluation_initial_days=_int(
                "FORECASTING_EVALUATION_INITIAL_DAYS", 365, 60, 2_000
            ),
            evaluation_horizon_days=_int(
                "FORECASTING_EVALUATION_HORIZON_DAYS", 7, 1, 30
            ),
            evaluation_folds=_int("FORECASTING_EVALUATION_FOLDS", 5, 2, 10),
            evaluation_step_days=_int(
                "FORECASTING_EVALUATION_STEP_DAYS", 28, 1, 365
            ),
        )


def get_forecasting_settings() -> ForecastingSettings:
    # Settings are intentionally read per cache/build operation. This lets an
    # operator refresh after changing environment/config without importing a
    # database client or leaking credentials into logs.
    return ForecastingSettings.from_env()
