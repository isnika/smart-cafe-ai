from __future__ import annotations

import hashlib
import threading
import time
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .config import ForecastingSettings, get_forecasting_settings
from .evaluation import fit_tree_model, recursive_predict, rolling_origin_evaluation
from .exceptions import (
    ForecastingBranchRequired,
    ForecastingDataQualityError,
    ForecastingDataUnavailable,
)
from .models import seasonal_naive, weekday_mean
from .repository import (
    DEMO_DATA_DIR,
    DemoForecastingRepository,
    ForecastingRepository,
    ForecastingSnapshot,
    OperationalForecastingRepository,
)

DATA_DIR = DEMO_DATA_DIR
DATA_PATH = DATA_DIR / "orders.csv"
ITEMS_PATH = DATA_DIR / "order_items.csv"
INVENTORY_PATH = DATA_DIR / "inventory.csv"
RECIPES_PATH = DATA_DIR / "recipes.csv"


def _localize(values: pd.Series, timezone: str) -> pd.Series:
    parsed = pd.to_datetime(values, errors="coerce")
    try:
        if parsed.dt.tz is None:
            return parsed.dt.tz_localize(timezone)
        return parsed.dt.tz_convert(timezone)
    except (AttributeError, TypeError, ValueError) as exc:
        raise ForecastingDataQualityError(
            "Timestamp forecasting không thể chuẩn hóa theo timezone của branch."
        ) from exc


def _local_dates(values: pd.Series, timezone: str) -> pd.Series:
    localized = _localize(values, timezone)
    return localized.dt.normalize().dt.tz_localize(None)


def _decision_quantity(value: float) -> int:
    if not np.isfinite(value):
        return 0
    return max(0, int(np.floor(float(value) + 0.5)))


class RevenueForecastService:
    """Serve revenue, product-demand and ingredient forecasts from one snapshot."""

    def __init__(
        self,
        data_path: Path | None = None,
        *,
        snapshot: ForecastingSnapshot | None = None,
        repository: ForecastingRepository | None = None,
        settings: ForecastingSettings | None = None,
        branch_id: int | None = None,
        authorization: str | None = None,
    ):
        settings = settings or get_forecasting_settings()
        if snapshot is None:
            if data_path is not None:
                settings = replace(settings, source_mode="demo")
                repository = DemoForecastingRepository(Path(data_path).parent, settings)
            elif repository is None:
                repository = self._repository_from_settings(settings)
            snapshot = repository.load_snapshot(
                branch_id=branch_id,
                authorization=authorization,
            )
        self.settings = settings
        self.snapshot = snapshot
        self.branch_id = snapshot.branch_id
        self.source_mode = snapshot.source_mode
        self.data_version = snapshot.version
        self.snapshot_generated_at = snapshot.generated_at
        self.timezone = snapshot.timezone
        self.cutoff_date = pd.Timestamp(snapshot.complete_through).normalize()
        self.trained_at = pd.Timestamp.now(tz="UTC")
        self.stale = False
        self.refresh_error: str | None = None
        self.quality = dict(snapshot.quality)
        self.orders = snapshot.orders.copy()
        self.order_items = snapshot.order_items.copy()
        self.recipes = snapshot.recipes.copy()
        self.inventory = snapshot.inventory.copy()
        self.history = self._build_revenue_history()
        self.evaluation = self._evaluate_and_fit()
        self.model_name = str(self.evaluation["selected_model"])
        self.model_version = settings.model_version
        self.model = self.evaluation.get("model")
        self.mae = self._selected_validation_metric("mae")
        self.validation_scores = {
            name: scores.get("mae")
            for name, scores in self.evaluation.get("validation", {}).items()
        }

    @staticmethod
    def _repository_from_settings(settings: ForecastingSettings) -> ForecastingRepository:
        if settings.source_mode == "demo":
            return DemoForecastingRepository(DEMO_DATA_DIR, settings)
        return OperationalForecastingRepository(settings)

    def _build_revenue_history(self) -> pd.Series:
        orders = self.orders.copy()
        orders = orders[orders["order_status"].eq("Completed")].copy()
        orders["revenue_amount_vnd"] = orders["order_total_vnd"].astype(float)
        payment = orders["payment_status"]
        partial = payment.eq("Partially_Refunded")
        if partial.any():
            if not self.quality.get("refund_amount_available"):
                raise ForecastingDataQualityError(
                    "Có order Partially_Refunded nhưng snapshot không có refunded_amount_vnd."
                )
            refund = orders.loc[partial, "refunded_amount_vnd"]
            if refund.isna().any():
                raise ForecastingDataQualityError(
                    "Có order Partially_Refunded thiếu số tiền refund; không tính doanh thu mơ hồ."
                )
            orders.loc[partial, "revenue_amount_vnd"] = (
                orders.loc[partial, "order_total_vnd"] - refund
            ).clip(lower=0)
        orders.loc[payment.eq("Refunded"), "revenue_amount_vnd"] = 0.0
        eligible_payment = payment.isin({"Paid", "Partially_Refunded", "Refunded"})
        excluded_status = self.orders[~self.orders["order_status"].eq("Completed")]
        self.quality["revenue_excluded_status_counts"] = (
            excluded_status["order_status"].value_counts().astype(int).to_dict()
        )
        self.quality["revenue_excluded_payment_counts"] = (
            self.orders.loc[
                self.orders["order_status"].eq("Completed") & ~eligible_payment,
                "payment_status",
            ]
            .value_counts()
            .astype(int)
            .to_dict()
        )
        orders = orders[eligible_payment & (orders["revenue_amount_vnd"] >= 0)].copy()
        if orders.empty:
            raise ForecastingDataQualityError("Không có doanh thu hợp lệ sau khi lọc nghiệp vụ.")
        dates = _local_dates(orders["order_time"], self.timezone)
        orders["business_date"] = dates
        orders = orders[orders["business_date"] <= self.cutoff_date]
        if orders.empty:
            raise ForecastingDataQualityError("Không có doanh thu trước complete_through.")
        daily_observed = orders.groupby("business_date")["revenue_amount_vnd"].sum().sort_index()
        start = daily_observed.index.min()
        index = pd.date_range(start, self.cutoff_date, freq="D")
        # Zero-fill is allowed only because the repository contract says the
        # snapshot is complete through complete_through. An outage must not be
        # silently converted to zero by an unbounded resample.
        daily = daily_observed.reindex(index, fill_value=0.0).astype(float)
        self.quality["revenue_observed_days"] = int(daily_observed.size)
        self.quality["revenue_filled_zero_days"] = int(len(index) - daily_observed.size)
        self.quality["revenue_cutoff_date"] = self.cutoff_date.strftime("%Y-%m-%d")
        return daily

    def _evaluate_and_fit(self) -> dict[str, Any]:
        if len(self.history) < 14:
            raise ForecastingDataQualityError(
                "Cần tối thiểu 14 ngày lịch sử để dùng baseline revenue forecast."
            )
        evaluation = rolling_origin_evaluation(
            self.history,
            initial_train_days=self.settings.evaluation_initial_days,
            horizon_days=self.settings.evaluation_horizon_days,
            step_days=self.settings.evaluation_step_days,
            max_folds=self.settings.evaluation_folds,
        )
        selected = evaluation["selected_model"]
        if selected in {"SeasonalNaive", "WeekdayMean8Weeks"}:
            model = None
        else:
            model = fit_tree_model(selected, self.history)
        evaluation["model"] = model
        return evaluation

    def _selected_validation_metric(self, metric: str) -> float | None:
        selected = self.evaluation.get("selected_model")
        value = self.evaluation.get("validation", {}).get(selected, {}).get(metric)
        return float(value) if value is not None else None

    def mark_stale(self, error: Exception) -> None:
        self.stale = True
        self.refresh_error = "Không refresh được snapshot/model mới; đang dùng model cũ."

    def _metadata(
        self,
        *,
        forecast_origin: pd.Timestamp,
        horizon_days: int,
        fallback_reason: str | None = None,
    ) -> dict[str, Any]:
        generated_at = self.snapshot_generated_at
        if isinstance(generated_at, pd.Timestamp):
            generated_at = generated_at.to_pydatetime()
        return {
            "branch_id": self.branch_id,
            "source_mode": self.source_mode,
            "data_version": self.data_version,
            "snapshot_generated_at": generated_at,
            "data_cutoff_date": self.cutoff_date.date(),
            "forecast_origin": pd.Timestamp(forecast_origin).date(),
            "horizon_days": horizon_days,
            "timezone": self.timezone,
            "model_version": self.model_version,
            "trained_at": self.trained_at.to_pydatetime(),
            "stale": self.stale,
            "refresh_error": self.refresh_error,
            "fallback_reason": fallback_reason,
        }

    def _forecast_value(self, history: pd.Series, target_date: pd.Timestamp) -> float:
        return recursive_predict(self.model_name, self.model, history, target_date, 1)[0]

    def _validate_future_target(self, target: pd.Timestamp) -> None:
        if target <= self.cutoff_date:
            raise ValueError(
                "Ngày dự báo phải sau data_cutoff_date; endpoint không giả lập quá khứ bằng dữ liệu tương lai."
            )

    def forecast(self, start_date: str, days: int = 1) -> dict:
        if not 1 <= days <= 90:
            raise ValueError("days phải nằm trong khoảng 1 đến 90")
        requested_start = pd.Timestamp(start_date).normalize()
        self._validate_future_target(requested_start)
        final_date = requested_start + pd.Timedelta(days=days - 1)
        history = self.history.copy()
        next_date = self.cutoff_date + pd.Timedelta(days=1)
        predictions: list[dict[str, Any]] = []
        while next_date <= final_date:
            prediction = max(0.0, float(self._forecast_value(history, next_date)))
            if not np.isfinite(prediction):
                prediction = max(0.0, float(history.tail(7).mean()))
            history.loc[next_date] = prediction
            if next_date >= requested_start:
                predictions.append(
                    {
                        "date": next_date.date(),
                        "predicted_revenue_vnd": _decision_quantity(prediction),
                    }
                )
            next_date += pd.Timedelta(days=1)
        fallback_reason = self.evaluation.get("fallback_reason")
        return {
            "start_date": requested_start.date(),
            "days": days,
            "branch_id": self.branch_id,
            "currency": "VND",
            "model": self.model_name,
            "model_version": self.model_version,
            "validation_mae_vnd": round(self.mae, 2) if self.mae is not None else None,
            "validation_scores_mae_vnd": {
                name: round(float(value), 2) if value is not None else None
                for name, value in self.validation_scores.items()
            },
            "validation_metrics": self.evaluation.get("validation", {}),
            "test_metrics": self.evaluation.get("test", {}),
            "validation_method": "rolling-origin recursive validation; last fold held out as test",
            "interval_available": False,
            "interval_reason": "Chưa có phương pháp prediction interval được calibrate.",
            "fallback_reason": fallback_reason,
            "metadata": self._metadata(
                forecast_origin=self.cutoff_date + pd.Timedelta(days=1),
                horizon_days=days,
                fallback_reason=fallback_reason,
            ),
            "forecast": predictions,
        }

    def _demand_rows(self) -> pd.DataFrame:
        items = self.order_items.copy()
        items = items[items["order_status"].eq("Completed")].copy()
        items["business_date"] = _local_dates(items["order_time"], self.timezone)
        items = items[items["business_date"] <= self.cutoff_date]
        return items[items["quantity"] > 0].copy()

    def forecast_products(self, target_date: str) -> dict:
        target = pd.Timestamp(target_date).normalize()
        self._validate_future_target(target)
        items = self._demand_rows()
        if items.empty:
            raise ForecastingDataQualityError("Không có completed order_items để dự báo product demand.")
        results: list[dict[str, Any]] = []
        fallback_count = 0
        group_columns = ["product_id", "variant_id", "product_name"]
        for (product_id, variant_id, product_name), group in items.groupby(group_columns, dropna=False):
            if pd.isna(variant_id):
                raise ForecastingDataQualityError(
                    "Product demand thiếu variant_id; không tự phân bổ demand xuống variant."
                )
            daily = group.groupby("business_date")["quantity"].sum().sort_index()
            index = pd.date_range(daily.index.min(), self.cutoff_date, freq="D")
            daily = daily.reindex(index, fill_value=0.0).tail(56)
            same_weekday = daily[daily.index.dayofweek == target.dayofweek]
            reason = None
            if len(same_weekday) >= 4:
                expected = float(same_weekday.mean())
            else:
                expected = float(daily.mean()) if len(daily) else 0.0
                reason = "sparse_weekday_history"
                fallback_count += 1
            if len(daily) < 14:
                reason = "short_product_history"
                fallback_count += 1
            results.append(
                {
                    "product_id": int(product_id),
                    "variant_id": int(variant_id),
                    "product_name": str(product_name or f"Product {int(product_id)}"),
                    "predicted_quantity": round(max(0.0, expected), 3),
                    "recommended_quantity": _decision_quantity(expected),
                    "fallback_reason": reason,
                }
            )
        results.sort(
            key=lambda item: (
                -float(item["predicted_quantity"]),
                int(item["variant_id"]),
                int(item["product_id"]),
            )
        )
        fallback_reason = "sparse_product_history" if fallback_count else None
        metadata = self._metadata(
            forecast_origin=target,
            horizon_days=1,
            fallback_reason=fallback_reason,
        )
        return {
            "forecast_date": target.date(),
            "branch_id": self.branch_id,
            "method": "recent 8-week weekday mean",
            "note": "Expected quantity; recommended_quantity is rounded with nearest-integer rule for operations.",
            "model": "WeekdayMean8Weeks",
            "model_version": self.model_version,
            "source_mode": self.source_mode,
            "data_cutoff_date": self.cutoff_date.date(),
            "timezone": self.timezone,
            "fallback_reason": fallback_reason,
            "products": results,
            "metadata": metadata,
        }

    def forecast_inventory(self, target_date: str) -> dict:
        product_forecast = self.forecast_products(target_date)
        demand = {
            int(item["variant_id"]): float(item["predicted_quantity"])
            for item in product_forecast["products"]
        }
        inventory_by_id = {
            int(row.ingredient_id): row
            for row in self.inventory.itertuples(index=False)
        }
        usage: dict[int, float] = {}
        ingredient_names: dict[int, str] = {}
        ingredient_units: dict[int, set[str]] = {}
        missing: dict[int, list[str]] = {}
        recipe_variant_ids = {int(value) for value in self.recipes["variant_id"].dropna().astype(int)}
        missing_data = [
            f"variant_id={variant_id} không có recipe"
            for variant_id in sorted(set(demand) - recipe_variant_ids)
        ]
        for row in self.recipes.itertuples(index=False):
            ingredient_id = int(row.ingredient_id)
            ingredient_names[ingredient_id] = str(row.ingredient_name or f"Ingredient {ingredient_id}")
            ingredient_units.setdefault(ingredient_id, set()).add(str(row.unit))
            if int(row.variant_id) not in demand:
                missing.setdefault(ingredient_id, []).append(
                    f"không có forecast cho variant_id={int(row.variant_id)}"
                )
                continue
            inv = inventory_by_id.get(ingredient_id)
            if inv is None:
                missing.setdefault(ingredient_id, []).append("không có inventory branch tương ứng")
                continue
            if str(row.unit) != str(inv.unit):
                missing.setdefault(ingredient_id, []).append(
                    f"unit mismatch recipe={row.unit}, inventory={inv.unit}"
                )
                continue
            usage[ingredient_id] = usage.get(ingredient_id, 0.0) + (
                demand[int(row.variant_id)] * float(row.quantity_required)
            )

        all_ingredient_ids = set(inventory_by_id) | set(ingredient_names)
        ingredients: list[dict[str, Any]] = []
        for ingredient_id in sorted(all_ingredient_ids):
            inv = inventory_by_id.get(ingredient_id)
            reasons = list(dict.fromkeys(missing.get(ingredient_id, [])))
            if inv is None:
                unit = next(iter(ingredient_units.get(ingredient_id, {""})))
                ingredients.append(
                    {
                        "ingredient_id": ingredient_id,
                        "ingredient_name": ingredient_names.get(ingredient_id, f"Ingredient {ingredient_id}"),
                        "unit": unit,
                        "available_stock": None,
                        "reorder_level": None,
                        "forecast_usage": round(usage[ingredient_id], 3) if ingredient_id in usage else None,
                        "recommended_purchase": None,
                        "status": "insufficient_data",
                        "missing_data": ["inventory branch tương ứng không tồn tại", *reasons],
                    }
                )
                continue
            available = float(inv.quantity_in_stock) - float(inv.reserved_quantity)
            unit = str(inv.unit)
            if ingredient_id not in ingredient_units:
                reasons.append("không có recipe hợp lệ cho ingredient này")
            if ingredient_id in ingredient_units and any(recipe_unit != unit for recipe_unit in ingredient_units[ingredient_id]):
                reasons.append("recipe và inventory không cùng đơn vị; không tự đổi đơn vị")
            forecast_usage = usage.get(ingredient_id)
            if reasons or forecast_usage is None:
                recommended = None
                status = "insufficient_data"
            else:
                recommended = max(
                    0.0,
                    forecast_usage + float(inv.reorder_level) - available,
                )
                status = "ok"
            ingredients.append(
                {
                    "ingredient_id": ingredient_id,
                    "ingredient_name": str(inv.ingredient_name or ingredient_names.get(ingredient_id, "")),
                    "unit": unit,
                    "available_stock": round(available, 3),
                    "reorder_level": round(float(inv.reorder_level), 3),
                    "forecast_usage": round(float(forecast_usage), 3) if forecast_usage is not None else None,
                    "recommended_purchase": round(float(recommended), 3) if recommended is not None else None,
                    "status": status,
                    "missing_data": list(dict.fromkeys(reasons)),
                }
            )
        fallback_reason = product_forecast.get("fallback_reason")
        if missing_data:
            fallback_reason = fallback_reason or "recipe_missing_for_forecast_variants"
        if any(item["status"] != "ok" for item in ingredients):
            fallback_reason = fallback_reason or "recipe_or_inventory_data_incomplete"
        metadata = self._metadata(
            forecast_origin=pd.Timestamp(target_date).normalize(),
            horizon_days=1,
            fallback_reason=fallback_reason,
        )
        return {
            "forecast_date": pd.Timestamp(target_date).date(),
            "branch_id": self.branch_id,
            "method": "predicted variant demand × Recipes.quantity_required",
            "model": "VariantDemandTimesRecipe",
            "model_version": self.model_version,
            "source_mode": self.source_mode,
            "data_cutoff_date": self.cutoff_date.date(),
            "timezone": self.timezone,
            "coverage_horizon_days": 1,
            "calculation_assumption": (
                "Forecast bắt đầu sau complete_through; reserved_quantity đã được trừ khỏi available_stock. "
                "reorder_level được dùng như ngưỡng bổ sung heuristic, không được gọi là safety stock. "
                "Không áp dụng hao hụt, lead time, inbound, MOQ hoặc pack size vì schema snapshot chưa cung cấp."
            ),
            "fallback_reason": fallback_reason,
            "missing_data": missing_data,
            "ingredients": ingredients,
            "metadata": metadata,
        }


@dataclass
class _CacheEntry:
    service: RevenueForecastService
    expires_at: float


_CACHE: dict[tuple, _CacheEntry] = {}
_CACHE_LOCK = threading.RLock()


def _auth_fingerprint(authorization: str | None) -> str:
    if not authorization:
        return "anonymous"
    return hashlib.sha256(authorization.encode("utf-8")).hexdigest()[:16]


def clear_forecast_service_cache(branch_id: int | None = None) -> None:
    with _CACHE_LOCK:
        if branch_id is None:
            _CACHE.clear()
        else:
            for key in list(_CACHE):
                if key[1] == branch_id:
                    _CACHE.pop(key, None)


def get_forecast_service(
    branch_id: int | None = None,
    authorization: str | None = None,
    *,
    force_refresh: bool = False,
) -> RevenueForecastService:
    settings = get_forecasting_settings()
    key = (
        settings.source_mode,
        branch_id,
        settings.model_version,
        settings.timezone,
        settings.evaluation_initial_days,
        settings.evaluation_horizon_days,
        settings.evaluation_folds,
        settings.evaluation_step_days,
        _auth_fingerprint(authorization) if settings.source_mode == "live" else "demo",
    )
    now = time.monotonic()
    with _CACHE_LOCK:
        entry = _CACHE.get(key)
        if entry and not force_refresh and entry.expires_at > now:
            return entry.service
        try:
            repository = (
                DemoForecastingRepository(DEMO_DATA_DIR, settings)
                if settings.source_mode == "demo"
                else OperationalForecastingRepository(settings)
            )
            service = RevenueForecastService(
                repository=repository,
                settings=settings,
                branch_id=branch_id,
                authorization=authorization,
            )
            _CACHE[key] = _CacheEntry(service=service, expires_at=now + settings.cache_ttl_seconds)
            return service
        except ForecastingDataUnavailable as exc:
            if entry:
                entry.service.mark_stale(exc)
                entry.expires_at = now + settings.cache_ttl_seconds
                return entry.service
            raise
