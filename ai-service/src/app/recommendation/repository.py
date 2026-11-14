from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import httpx
import pandas as pd

from src.app.recommendation.config import RecommendationSettings
from src.app.recommendation.exceptions import (
    RecommendationAuthorizationError,
    RecommendationDataUnavailable,
)
from src.app.recommendation.preprocessing.preprocessing import (
    load_interactions,
    load_products,
    normalize_interactions,
    normalize_products,
)

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
DEMO_DATA_DIR = BASE_DIR / "data_mock"


@dataclass(frozen=True)
class RecommendationSnapshot:
    """A validated data snapshot used to build one serving model."""

    products: pd.DataFrame
    interactions: pd.DataFrame
    version: str | None = None
    generated_at: pd.Timestamp | None = None


class RecommendationRepository(Protocol):
    """Read-only source used to build a recommendation snapshot."""

    def load_snapshot(
        self,
        branch_id: int | None = None,
        authorization: str | None = None,
    ) -> RecommendationSnapshot:
        ...


def _records(payload: Any, *keys: str) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    nested = payload.get("data")
    if isinstance(nested, dict):
        payload = nested
    for key in keys:
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return []


def _text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value in {0, 1}:
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "active", "available"}:
            return True
        if normalized in {"false", "0", "no", "inactive", "unavailable"}:
            return False
    return None


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _product_rows(raw_products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in raw_products:
        product_id = _number(item.get("product_id", item.get("id")))
        name = _text(item.get("name", item.get("product_name")))
        if product_id is None or not name:
            continue

        category = item.get("category", item.get("category_name", ""))
        if isinstance(category, dict):
            category = category.get("name", "")

        raw_variants = item.get("variants", item.get("product_variants", []))
        if not isinstance(raw_variants, list):
            raw_variants = []
        active_prices: list[float] = []
        availability_states: list[bool | None] = []
        for variant in raw_variants:
            if not isinstance(variant, dict):
                continue
            variant_status = _bool(variant.get("is_active", variant.get("status")))
            if variant_status is False:
                continue
            price = _number(variant.get("price", variant.get("price_vnd")))
            if price is not None and price >= 0:
                active_prices.append(price)
            if "is_available" in variant:
                availability_states.append(_bool(variant.get("is_available")))

        price = _number(item.get("price_vnd", item.get("price")))
        if price is None and active_prices:
            price = min(active_prices)
        if price is None or price <= 0:
            continue

        is_available = _bool(item.get("is_available"))
        if is_available is None and availability_states:
            if any(state is True for state in availability_states):
                is_available = True
            elif all(state is False for state in availability_states):
                is_available = False

        tags = item.get("flavor_tags", [])
        if isinstance(tags, (tuple, list)):
            tags = "|".join(_text(tag) for tag in tags if _text(tag))

        status = item.get("status")
        is_active = _bool(item.get("is_active"))
        if is_active is None and status is not None:
            is_active = _text(status).lower() == "active"

        rows.append(
            {
                "product_id": int(product_id),
                "name": name,
                "category": _text(category),
                "description": _text(item.get("description")),
                "price_vnd": price,
                "temperature": _text(item.get("temperature")),
                "caffeine_level": _text(item.get("caffeine_level")),
                "flavor_tags": tags,
                "launch_date": item.get("launch_date", item.get("created_at")),
                "image": _text(item.get("image")),
                "is_active": True if is_active is None else is_active,
                "is_available": is_available,
            }
        )
    return rows


def _interaction_rows(raw_interactions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in raw_interactions:
        user_id = _text(item.get("user_id"))
        product_id = _number(item.get("product_id"))
        quantity = _number(item.get("quantity", item.get("interaction")))
        n_orders = _number(item.get("n_orders", item.get("order_count", 1)))
        last_purchase = item.get("last_purchase", item.get("purchased_at"))
        if not user_id or product_id is None or quantity is None or n_orders is None:
            continue
        rows.append(
            {
                "user_id": user_id,
                "product_id": int(product_id),
                "quantity": quantity,
                "rating": item.get("rating"),
                "n_orders": n_orders,
                "last_purchase": last_purchase,
            }
        )
    return rows


class DemoRecommendationRepository:
    """Explicit demo/test source. Never selected by live-mode failures."""

    def __init__(self, data_dir: Path | None = None):
        self.data_dir = data_dir or DEMO_DATA_DIR

    def load_snapshot(
        self,
        branch_id: int | None = None,
        authorization: str | None = None,
    ) -> RecommendationSnapshot:
        del branch_id, authorization
        products = load_products(self.data_dir / "products.csv")
        interactions = load_interactions(self.data_dir / "user_item_summary.csv")
        return RecommendationSnapshot(products=products, interactions=interactions, version="demo")


class OperationalRecommendationRepository:
    """HTTP adapter for the backend-owned recommendation snapshot contract."""

    def __init__(self, settings: RecommendationSettings):
        self.settings = settings

    @property
    def enabled(self) -> bool:
        return bool(self.settings.data_api_base_url)

    def _headers(self, authorization: str | None = None) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.settings.data_api_key:
            headers["X-API-Key"] = self.settings.data_api_key
        if authorization:
            headers["Authorization"] = authorization
        return headers

    def _get(
        self,
        path: str,
        params: dict[str, int | str] | None = None,
        authorization: str | None = None,
    ) -> Any:
        if not self.enabled:
            raise RecommendationDataUnavailable(
                "Live recommendation source chưa được cấu hình DATA_API_BASE_URL."
            )
        url = self.settings.data_api_base_url + "/" + path.lstrip("/")
        try:
            with httpx.Client(timeout=self.settings.data_api_timeout_seconds) as client:
                response = client.get(url, params=params, headers=self._headers(authorization))
                response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            logger.warning(
                "Recommendation operational API không khả dụng (error_type=%s)",
                type(exc).__name__,
            )
            raise RecommendationDataUnavailable(
                "Không thể đọc dữ liệu recommendation từ backend."
            ) from exc

    def load_snapshot(
        self,
        branch_id: int | None = None,
        authorization: str | None = None,
    ) -> RecommendationSnapshot:
        params = {"branch_id": branch_id} if branch_id is not None else None
        payload = self._get(self.settings.snapshot_path, params, authorization)
        raw_products = _records(payload, "products", "catalog")
        if not raw_products:
            raise RecommendationDataUnavailable(
                "Backend recommendation snapshot không có sản phẩm hợp lệ."
            )
        raw_interactions = _records(
            payload,
            "interactions",
            "user_item_summary",
            "user_product_interactions",
        )
        products = normalize_products(pd.DataFrame(_product_rows(raw_products)))
        interactions = normalize_interactions(pd.DataFrame(_interaction_rows(raw_interactions)))
        if products.empty:
            raise RecommendationDataUnavailable(
                "Backend recommendation snapshot không có sản phẩm đang bán."
            )
        version = None
        generated_at = None
        if isinstance(payload, dict):
            version = _text(payload.get("version")) or None
            raw_time = payload.get("generated_at")
            generated_at = pd.to_datetime(raw_time, errors="coerce") if raw_time else None
        return RecommendationSnapshot(
            products=products,
            interactions=interactions,
            version=version,
            generated_at=generated_at,
        )

    def get_authorized_user_id(self, authorization: str | None) -> str:
        if not authorization:
            raise RecommendationAuthorizationError(
                "Cần Authorization để lấy recommendation cá nhân hóa."
            )
        payload = self._get(self.settings.viewer_path, authorization=authorization)
        if isinstance(payload, dict) and isinstance(payload.get("data"), dict):
            payload = payload["data"]
        user_id = _text(payload.get("user_id")) if isinstance(payload, dict) else ""
        if not user_id:
            raise RecommendationAuthorizationError(
                "Backend không xác nhận được người dùng hiện tại."
            )
        return user_id
