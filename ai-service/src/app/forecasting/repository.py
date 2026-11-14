from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import httpx
import pandas as pd

from .config import ForecastingSettings
from .exceptions import ForecastingDataQualityError, ForecastingDataUnavailable, ForecastingBranchRequired
from .preprocessing import (
    normalize_inventory,
    normalize_order_items,
    normalize_orders,
    normalize_recipes,
)

logger = logging.getLogger(__name__)
BASE_DIR = Path(__file__).resolve().parent
DEMO_DATA_DIR = BASE_DIR / "data_mock"


@dataclass(frozen=True)
class ForecastingSnapshot:
    orders: pd.DataFrame
    order_items: pd.DataFrame
    recipes: pd.DataFrame
    inventory: pd.DataFrame
    branch_id: int
    timezone: str
    version: str
    generated_at: pd.Timestamp | None
    complete_through: pd.Timestamp
    source_mode: str
    quality: dict[str, Any]


class ForecastingRepository(Protocol):
    def load_snapshot(
        self,
        branch_id: int | None = None,
        authorization: str | None = None,
    ) -> ForecastingSnapshot:
        ...


class ForecastPersistenceRepository(Protocol):
    """Optional Spring Boot write contract for the AI_Forecasts read model."""

    def save_run(self, payload: dict[str, Any], authorization: str | None = None) -> None:
        """Persist an idempotent run; implementation belongs to backend ownership."""
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


def _payload_value(payload: dict[str, Any], key: str, default: Any = None) -> Any:
    value = payload.get(key, default)
    if value is not None:
        return value
    data = payload.get("data")
    return data.get(key, default) if isinstance(data, dict) else default


def _version_for_files(paths: list[Path]) -> str:
    parts = []
    for path in paths:
        stat = path.stat()
        parts.append(f"{path.name}:{stat.st_size}:{stat.st_mtime_ns}")
    return "demo-" + "|".join(parts)


def _parse_timestamp(value: Any, label: str) -> pd.Timestamp:
    parsed = pd.to_datetime(value, errors="coerce", utc=True)
    if pd.isna(parsed):
        raise ForecastingDataQualityError(f"Snapshot thiếu {label} hợp lệ.")
    return pd.Timestamp(parsed)


def _complete_through(
    raw_value: Any,
    orders: pd.DataFrame,
    timezone: str,
    *,
    require_metadata: bool,
) -> pd.Timestamp:
    if raw_value is None and require_metadata:
        raise ForecastingDataQualityError(
            "Live forecasting snapshot phải có complete_through để phân biệt ngày thiếu dữ liệu với ngày không bán."
        )
    if raw_value is None:
        raw_value = orders["order_time"].max()
    cutoff = _parse_timestamp(raw_value, "complete_through")
    local = cutoff.tz_convert(timezone).normalize().tz_localize(None)
    if not orders.empty:
        max_order = pd.to_datetime(orders["order_time"], utc=True).max()
        max_local = max_order.tz_convert(timezone).normalize().tz_localize(None)
        if local > max_local:
            raise ForecastingDataQualityError(
                "complete_through không được sau order_time mới nhất trong snapshot."
            )
    return local


def _normalize_snapshot(
    payload: dict[str, Any],
    branch_id: int,
    settings: ForecastingSettings,
    *,
    source_mode: str,
    version: str,
    generated_at: pd.Timestamp | None,
    demo_product_recipe_mapping: bool = False,
) -> ForecastingSnapshot:
    timezone = str(_payload_value(payload, "timezone", settings.timezone) or settings.timezone)
    try:
        pd.Timestamp.now(tz=timezone)
    except Exception as exc:
        raise ForecastingDataQualityError("Timezone của forecasting snapshot không hợp lệ.") from exc

    raw_orders = _records(payload, "orders", "revenue_orders")
    raw_items = _records(payload, "order_items", "items", "demand_items")
    raw_recipes = _records(payload, "recipes")
    raw_inventory = _records(payload, "inventory", "inventories")
    if not raw_orders:
        raise ForecastingDataUnavailable("Forecasting snapshot không có orders hợp lệ.")
    if not raw_items:
        raise ForecastingDataUnavailable("Forecasting snapshot không có order_items hợp lệ.")
    if not raw_recipes:
        raise ForecastingDataUnavailable("Forecasting snapshot không có recipes hợp lệ.")
    if not raw_inventory:
        raise ForecastingDataUnavailable("Forecasting snapshot không có inventory hợp lệ.")
    coverage_complete = _payload_value(payload, "coverage_complete")
    if source_mode == "live" and coverage_complete is not True:
        raise ForecastingDataQualityError(
            "Live forecasting snapshot phải xác nhận coverage_complete=true; không tự điền 0 cho outage."
        )

    orders, order_quality = normalize_orders(pd.DataFrame(raw_orders), branch_id)
    items, item_quality = normalize_order_items(pd.DataFrame(raw_items), branch_id)
    recipes_frame = pd.DataFrame(raw_recipes)
    if demo_product_recipe_mapping and "variant_id" not in recipes_frame.columns:
        recipes_frame = recipes_frame.rename(columns={"product_id": "variant_id"})
    recipes, recipe_quality = normalize_recipes(recipes_frame, branch_id)
    inventory, inventory_quality = normalize_inventory(pd.DataFrame(raw_inventory), branch_id)
    if orders.empty:
        raise ForecastingDataUnavailable("Không có order nào thuộc branch được yêu cầu.")

    # The order-item payload may omit duplicated order fields. Join only from
    # the validated order snapshot; this prevents items from an open/cancelled
    # order being treated as demand.
    order_fields = orders[["order_id", "order_time", "order_status", "payment_status"]]
    items = items.drop(columns=["order_time", "order_status", "payment_status"], errors="ignore")
    items = items.merge(order_fields, on="order_id", how="inner", validate="many_to_one")
    if items.empty:
        raise ForecastingDataUnavailable("Không có order_item nào ghép được với orders hợp lệ.")
    if items["variant_id"].isna().any():
        if source_mode == "live":
            raise ForecastingDataQualityError(
                "Live order_items phải có variant_id cho mọi dòng; không tự phân bổ product demand xuống variant."
            )
        items["variant_id"] = items["product_id"].astype(int)
    items["variant_id"] = items["variant_id"].astype("Int64")

    complete_through = _complete_through(
        _payload_value(payload, "complete_through"),
        orders,
        timezone,
        require_metadata=source_mode == "live",
    )
    quality = {
        **order_quality,
        **item_quality,
        **recipe_quality,
        **inventory_quality,
        "demo_product_recipe_mapping": demo_product_recipe_mapping,
        "orders_rows": len(orders),
        "order_items_rows": len(items),
        "recipes_rows": len(recipes),
        "inventory_rows": len(inventory),
        "revenue_basis": "order_total_vnd after status/payment/refund rules",
        "demand_basis": "completed order items; refund does not erase completed consumption",
        "coverage_complete": bool(coverage_complete is True or source_mode == "demo"),
    }
    return ForecastingSnapshot(
        orders=orders,
        order_items=items,
        recipes=recipes,
        inventory=inventory,
        branch_id=int(branch_id),
        timezone=timezone,
        version=version,
        generated_at=generated_at,
        complete_through=complete_through,
        source_mode=source_mode,
        quality=quality,
    )


class DemoForecastingRepository:
    def __init__(self, data_dir: Path | None = None, settings: ForecastingSettings | None = None):
        self.data_dir = data_dir or DEMO_DATA_DIR
        self.settings = settings or ForecastingSettings.from_env()

    def load_snapshot(
        self,
        branch_id: int | None = None,
        authorization: str | None = None,
    ) -> ForecastingSnapshot:
        del authorization
        paths = [
            self.data_dir / "orders.csv",
            self.data_dir / "order_items.csv",
            self.data_dir / "recipes.csv",
            self.data_dir / "inventory.csv",
        ]
        if not all(path.exists() for path in paths):
            raise ForecastingDataUnavailable("Dữ liệu forecasting demo chưa đầy đủ.")
        orders = pd.read_csv(paths[0])
        raw_branch_ids = pd.to_numeric(orders.get("branch_id"), errors="coerce").dropna().astype(int).unique()
        if branch_id is None:
            if len(raw_branch_ids) != 1:
                raise ForecastingBranchRequired(
                    "Demo có nhiều branch; phải truyền branch_id, không được gộp toàn hệ thống."
                )
            branch_id = int(raw_branch_ids[0])
        version = _version_for_files(paths)
        generated_at = pd.Timestamp.fromtimestamp(
            max(path.stat().st_mtime for path in paths), tz="UTC"
        )
        payload = {
            "orders": orders.to_dict("records"),
            "order_items": pd.read_csv(paths[1]).to_dict("records"),
            "recipes": pd.read_csv(paths[2]).to_dict("records"),
            "inventory": pd.read_csv(paths[3]).to_dict("records"),
            "timezone": self.settings.timezone,
            # The CSV fixture stores branch-local naive timestamps. Keep the
            # cutoff as a local business date instead of interpreting it as UTC
            # and accidentally moving it across midnight.
            "complete_through": pd.to_datetime(orders["order_time"], errors="coerce").max().strftime("%Y-%m-%d"),
            "coverage_complete": True,
        }
        return _normalize_snapshot(
            payload,
            int(branch_id),
            self.settings,
            source_mode="demo",
            version=version,
            generated_at=generated_at,
            demo_product_recipe_mapping=True,
        )


class OperationalForecastingRepository:
    """Read-only adapter for the Spring Boot-owned snapshot contract.

    The default path is a proposed contract. It is not claimed to exist until
    the backend implements and exposes it.
    """

    def __init__(self, settings: ForecastingSettings):
        self.settings = settings

    def _headers(self, authorization: str | None) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.settings.data_api_key:
            headers["X-API-Key"] = self.settings.data_api_key
        if authorization:
            headers["Authorization"] = authorization
        return headers

    def load_snapshot(
        self,
        branch_id: int | None = None,
        authorization: str | None = None,
    ) -> ForecastingSnapshot:
        if branch_id is None:
            raise ForecastingBranchRequired(
                "Live forecasting yêu cầu branch_id; không gộp dữ liệu nhiều chi nhánh."
            )
        if not self.settings.data_api_base_url:
            raise ForecastingDataUnavailable(
                "Live forecasting chưa được cấu hình FORECASTING_DATA_API_BASE_URL hoặc DATA_API_BASE_URL."
            )
        url = self.settings.data_api_base_url + "/" + self.settings.snapshot_path.lstrip("/")
        try:
            with httpx.Client(timeout=self.settings.data_api_timeout_seconds) as client:
                response = client.get(
                    url,
                    params={"branch_id": branch_id},
                    headers=self._headers(authorization),
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            logger.warning(
                "Forecasting operational API unavailable (error_type=%s)",
                type(exc).__name__,
            )
            raise ForecastingDataUnavailable(
                "Không thể đọc snapshot forecasting từ backend."
            ) from exc
        if not isinstance(payload, dict):
            raise ForecastingDataQualityError("Backend forecasting snapshot phải là object JSON.")
        version = str(_payload_value(payload, "version", "unknown"))
        generated_raw = _payload_value(payload, "generated_at")
        generated_at = pd.to_datetime(generated_raw, errors="coerce", utc=True) if generated_raw else None
        if generated_at is not None and pd.isna(generated_at):
            generated_at = None
        return _normalize_snapshot(
            payload,
            int(branch_id),
            self.settings,
            source_mode="live",
            version=version,
            generated_at=generated_at,
        )
