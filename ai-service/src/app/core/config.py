"""Cấu hình runtime tập trung cho AI service.

Không đọc ``.env`` trực tiếp: container/orchestrator chịu trách nhiệm inject
environment. Các helper ở đây giữ default giữa local, test và Docker đồng nhất.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


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


def _origins() -> tuple[str, ...]:
    raw = os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    return tuple(dict.fromkeys(item.strip().rstrip("/") for item in raw.split(",") if item.strip()))


@dataclass(frozen=True)
class Settings:
    cors_allowed_origins: tuple[str, ...]
    chat_rate_limit_per_minute: int
    chat_rate_limit_enabled: bool
    trust_proxy_headers: bool
    reindex_api_key: str
    source_mode: str
    preload_chat: bool
    warm_embedding_model: bool
    llm_warmup: bool
    naturalize_responses: bool
    data_api_base_url: str
    data_api_key: str
    data_api_timeout_seconds: float
    data_api_catalog_path: str
    data_api_order_path: str

    @classmethod
    def from_env(cls) -> "Settings":
        source_mode = os.getenv("CHAT_SOURCE_MODE", "metadata").strip().lower()
        if source_mode not in {"off", "metadata", "full"}:
            source_mode = "metadata"
        return cls(
            cors_allowed_origins=_origins(),
            chat_rate_limit_per_minute=_int("CHAT_RATE_LIMIT_PER_MINUTE", 60, 1, 10_000),
            chat_rate_limit_enabled=_bool("CHAT_RATE_LIMIT_ENABLED", True),
            trust_proxy_headers=_bool("TRUST_PROXY_HEADERS", False),
            reindex_api_key=os.getenv("CHAT_REINDEX_API_KEY", "").strip(),
            source_mode=source_mode,
            preload_chat=_bool("PRELOAD_CHAT", True),
            warm_embedding_model=_bool("RAG_WARM_EMBEDDING_MODEL", True),
            llm_warmup=_bool("LLM_WARMUP", False),
            naturalize_responses=_bool("CHAT_NATURALIZE_RESPONSES", True),
            data_api_base_url=os.getenv("DATA_API_BASE_URL", "").strip().rstrip("/"),
            data_api_key=os.getenv("DATA_API_KEY", "").strip(),
            data_api_timeout_seconds=_float("DATA_API_TIMEOUT_SECONDS", 3.0, 0.2, 30.0),
            data_api_catalog_path=os.getenv(
                "DATA_API_CATALOG_PATH", "/api/ai/catalog/search"
            ).strip(),
            data_api_order_path=os.getenv(
                "DATA_API_ORDER_PATH", "/api/ai/orders/{order_code}"
            ).strip(),
        )


@lru_cache
def get_settings() -> Settings:
    return Settings.from_env()
