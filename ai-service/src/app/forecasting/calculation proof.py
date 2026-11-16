"""Independent calculation proof for the forecasting serving pipeline."""

from __future__ import annotations

import argparse
import math
import sys
from dataclasses import replace
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
FORECASTING_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT = FORECASTING_DIR / "calculation proof.md"
TOLERANCE = 1e-8
ROUNDING_TOLERANCE = 0.5
sys.path.insert(0, str(ROOT))

from src.app.forecasting.config import get_forecasting_settings  # noqa: E402
from src.app.forecasting.evaluation import (  # noqa: E402
    BASELINE_NAMES,
    CANDIDATE_NAMES,
)
from src.app.forecasting.exceptions import (  # noqa: E402
    ForecastingBranchRequired,
    ForecastingDataQualityError,
    ForecastingDataUnavailable,
)
from src.app.forecasting.features import FEATURE_COLUMNS, make_training_frame  # noqa: E402
from src.app.forecasting.models import seasonal_naive, weekday_mean  # noqa: E402
from src.app.forecasting.repository import (  # noqa: E402
    DEMO_DATA_DIR,
    DemoForecastingRepository,
    OperationalForecastingRepository,
)
from src.app.forecasting.service import RevenueForecastService  # noqa: E402


def _fmt(value: Any, digits: int = 8) -> str:
    if value is None:
        return "NOT VERIFIED"
    try:
        if pd.isna(value):
            return "N/A"
    except (TypeError, ValueError):
        pass
    if isinstance(value, (float, np.floating)):
        if not math.isfinite(float(value)):
            return "N/A"
        return f"{float(value):.{digits}f}".rstrip("0").rstrip(".")
    return str(value)


def _md(value: Any) -> str:
    return str(value).replace("|", "\\|").replace(chr(10), " ")


def _table(headers: list[str], rows: list[list[Any]]) -> list[str]:
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    lines.extend(
        "| " + " | ".join(_md(value) for value in row) + " |"
        for row in rows
    )
    return lines


def _status(ok: bool | None) -> str:
    if ok is None:
        return "NOT VERIFIED"
    return "PASS" if ok else "FAIL"


def _local_dates(values: pd.Series, timezone: str) -> pd.Series:
    parsed = pd.to_datetime(values, errors="coerce")
    if parsed.dt.tz is None:
        parsed = parsed.dt.tz_localize(timezone)
    else:
        parsed = parsed.dt.tz_convert(timezone)
    return parsed.dt.normalize().dt.tz_localize(None)


def _independent_revenue_amounts(
    orders: pd.DataFrame,
    refund_amount_available: bool,
) -> tuple[pd.DataFrame, str | None]:
    rows = orders.copy()
    rows["independent_revenue_vnd"] = np.nan
    for index, row in rows.iterrows():
        if str(row.order_status) != "Completed":
            continue
        payment = str(row.payment_status)
        if payment == "Paid":
            amount = float(row.order_total_vnd)
        elif payment == "Partially_Refunded":
            if not refund_amount_available or pd.isna(row.refunded_amount_vnd):
                return rows, "Partially_Refunded thiếu refunded_amount_vnd."
            amount = max(
                0.0,
                float(row.order_total_vnd) - float(row.refunded_amount_vnd),
            )
        elif payment == "Refunded":
            amount = 0.0
        else:
            continue
        rows.at[index, "independent_revenue_vnd"] = amount
    return rows, None


def _independent_revenue_series(service: RevenueForecastService) -> tuple[pd.Series, pd.DataFrame, str | None]:
    rows, error = _independent_revenue_amounts(
        service.orders,
        bool(service.quality.get("refund_amount_available")),
    )
    if error:
        return pd.Series(dtype=float), rows, error
    rows = rows[rows["independent_revenue_vnd"].notna()].copy()
    if rows.empty:
        return pd.Series(dtype=float), rows, "Không có order doanh thu hợp lệ."
    rows["business_date"] = _local_dates(rows["order_time"], service.timezone)
    rows = rows[rows["business_date"] <= service.cutoff_date]
    observed = rows.groupby("business_date")["independent_revenue_vnd"].sum().sort_index()
    if observed.empty:
        return pd.Series(dtype=float), rows, "Không có doanh thu trước cutoff."
    index = pd.date_range(observed.index.min(), service.cutoff_date, freq="D")
    return observed.reindex(index, fill_value=0.0).astype(float), rows, None


def _raw_demo_counts(source_mode: str) -> dict[str, int | None]:
    if source_mode != "demo":
        return {"orders_before_normalize": None, "items_before_normalize": None}
    paths = [
        DEMO_DATA_DIR / "orders.csv",
        DEMO_DATA_DIR / "order_items.csv",
    ]
    return {
        "orders_before_normalize": len(pd.read_csv(paths[0])) if paths[0].exists() else None,
        "items_before_normalize": len(pd.read_csv(paths[1])) if paths[1].exists() else None,
    }


def _manual_feature_values(history: pd.Series, target: pd.Timestamp) -> dict[str, float | int]:
    before = history.loc[: target - pd.Timedelta(days=1)]
    if len(before) < 28:
        raise ValueError("Không đủ 28 ngày trước target để tính feature.")
    return {
        "day_of_week": int(target.dayofweek),
        "day_of_month": int(target.day),
        "month": int(target.month),
        "day_of_year": int(target.dayofyear),
        "is_weekend": int(target.dayofweek >= 5),
        "lag_1": float(before.iloc[-1]),
        "lag_7": float(before.iloc[-7]),
        "lag_14": float(before.iloc[-14]),
        "rolling_mean_7": float(before.iloc[-7:].mean()),
        "rolling_mean_28": float(before.iloc[-28:].mean()),
    }


def _feature_inputs(target: pd.Timestamp, feature: str) -> str:
    if feature == "lag_1":
        return (target - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    if feature == "lag_7":
        return (target - pd.Timedelta(days=7)).strftime("%Y-%m-%d")
    if feature == "lag_14":
        return (target - pd.Timedelta(days=14)).strftime("%Y-%m-%d")
    if feature == "rolling_mean_7":
        return (
            f"{(target - pd.Timedelta(days=7)).strftime('%Y-%m-%d')}"
            f"..{(target - pd.Timedelta(days=1)).strftime('%Y-%m-%d')}"
        )
    if feature == "rolling_mean_28":
        return (
            f"{(target - pd.Timedelta(days=28)).strftime('%Y-%m-%d')}"
            f"..{(target - pd.Timedelta(days=1)).strftime('%Y-%m-%d')}"
        )
    return "calendar only"


def _manual_forecast_step(
    service: RevenueForecastService,
    history: pd.Series,
    target: pd.Timestamp,
) -> tuple[float, dict[str, Any], list[pd.Timestamp]]:
    model_name = service.model_name
    if model_name == "SeasonalNaive":
        used = [history.index[-7]] if len(history) >= 7 else list(history.index)
        raw = seasonal_naive(history, target)
        return float(raw), {"method": "same weekday previous week"}, used
    if model_name == "WeekdayMean8Weeks":
        recent = history.tail(56)
        same_weekday = recent[recent.index.dayofweek == target.dayofweek]
        if len(same_weekday) >= 4:
            used_values = same_weekday
        else:
            used_values = recent
        raw = float(used_values.mean()) if len(used_values) else 0.0
        return (
            raw,
            {
                "method": "weekday mean",
                "used_dates": [item.strftime("%Y-%m-%d") for item in used_values.index],
                "used_values": [float(value) for value in used_values],
            },
            list(used_values.index),
        )
    feature_values = _manual_feature_values(history, target)
    row = pd.DataFrame([feature_values], columns=FEATURE_COLUMNS)
    raw = float(service.model.predict(row)[0])
    used = [
        target - pd.Timedelta(days=1),
        target - pd.Timedelta(days=7),
        target - pd.Timedelta(days=14),
    ]
    used.extend(target - pd.Timedelta(days=offset) for offset in range(1, 29))
    return raw, feature_values, sorted(set(used))


def _independent_recursive_trace(
    service: RevenueForecastService,
    requested_start: pd.Timestamp,
    days: int,
) -> list[dict[str, Any]]:
    history = service.history.copy()
    cutoff = service.cutoff_date
    final_date = requested_start + pd.Timedelta(days=days - 1)
    next_date = cutoff + pd.Timedelta(days=1)
    rows: list[dict[str, Any]] = []
    step = 0
    while next_date <= final_date:
        step += 1
        raw, inputs, used_dates = _manual_forecast_step(service, history, next_date)
        safe_value = max(0.0, raw) if math.isfinite(raw) else 0.0
        serialized = max(0, int(math.floor(safe_value + 0.5)))
        rows.append(
            {
                "step": step,
                "date": next_date,
                "is_warmup": next_date < requested_start,
                "inputs": inputs,
                "used_dates": used_dates,
                "raw": raw,
                "safe_value": safe_value,
                "serialized": serialized,
            }
        )
        history.loc[next_date] = safe_value
        next_date += pd.Timedelta(days=1)
    return rows


def _metrics(actual: list[float], forecast: list[float]) -> dict[str, float | None]:
    y_true = np.asarray(actual, dtype=float)
    y_pred = np.asarray(forecast, dtype=float)
    errors = y_pred - y_true
    denominator = float(np.abs(y_true).sum())
    return {
        "mae": float(np.abs(errors).mean()) if len(errors) else None,
        "rmse": float(np.sqrt(np.mean(errors ** 2))) if len(errors) else None,
        "wape_percent": float(np.abs(errors).sum() / denominator * 100)
        if denominator > 0
        else None,
        "mean_signed_error": float(errors.mean()) if len(errors) else None,
    }


def _build_context(args: argparse.Namespace) -> tuple[RevenueForecastService, str, pd.Timestamp]:
    settings = get_forecasting_settings()
    source_mode = args.source_mode or settings.source_mode
    settings = replace(
        settings,
        source_mode=source_mode,
        evaluation_horizon_days=args.backtest_horizon,
        evaluation_folds=args.backtest_folds,
    )
    repository = (
        DemoForecastingRepository(DEMO_DATA_DIR, settings)
        if source_mode == "demo"
        else OperationalForecastingRepository(settings)
    )
    snapshot = repository.load_snapshot(branch_id=args.branch_id)
    service = RevenueForecastService(snapshot=snapshot, settings=settings)
    start = (
        pd.Timestamp(args.start_date).normalize()
        if args.start_date
        else service.cutoff_date + pd.Timedelta(days=1)
    )
    if start <= service.cutoff_date:
        raise ValueError(
            "start_date phải sau cutoff; proof không dùng dữ liệu tương lai để giả lập quá khứ."
        )
    return service, source_mode, start


def _data_proof(service: RevenueForecastService, source_mode: str) -> tuple[list[str], bool | None]:
    snapshot = service.snapshot
    independent, independent_rows, revenue_error = _independent_revenue_series(service)
    lines = [
        "## 4. Kiểm chứng dữ liệu doanh thu",
        "",
        "Revenue được tính từ Orders.final_amount/order_total_vnd, ghi nhận theo "
        "business date sau chuyển timezone branch. Pipeline chỉ dùng Completed; "
        "Paid dùng toàn bộ tiền, Partially_Refunded trừ refunded_amount_vnd, "
        "Refunded đóng góp 0. Order item không được join vào revenue.",
        "",
    ]
    quality = service.quality
    raw = {
        "orders_before_normalize": quality.get("orders_before_normalize"),
        "items_before_normalize": quality.get("order_items_before_normalize"),
    }
    lines += _table(
        ["Hạng mục", "Giá trị", "Trạng thái"],
        [
            ["Source mode", source_mode, "PASS" if source_mode == "demo" else "NOT VERIFIED"],
            ["Branch", service.branch_id, "PASS"],
            ["Timezone", service.timezone, "PASS"],
            ["Data version", service.data_version, "PASS"],
            ["Snapshot generated_at", service.snapshot_generated_at or "N/A", "PASS"],
            ["Complete through", service.cutoff_date.date(), "PASS"],
            ["Orders trước normalize", raw["orders_before_normalize"] or "NOT VERIFIED", "PASS" if raw["orders_before_normalize"] is not None else "NOT VERIFIED"],
            ["Orders sau normalize", quality.get("orders_rows"), "PASS"],
            ["Order items trước normalize", raw["items_before_normalize"] or "NOT VERIFIED", "PASS" if raw["items_before_normalize"] is not None else "NOT VERIFIED"],
            ["Order items sau join hợp lệ", quality.get("order_items_rows"), "PASS"],
            ["Orders invalid bị loại", quality.get("orders_invalid_removed", 0), "PASS"],
            ["Order item duplicate exact bị loại", quality.get("order_items_exact_duplicates_removed", 0), "PASS" if quality.get("order_items_exact_duplicates_removed", 0) == 0 else "NOT VERIFIED"],
            ["Coverage complete", quality.get("coverage_complete"), "PASS" if quality.get("coverage_complete") else "NOT VERIFIED"],
            ["Ngày được fill 0", quality.get("revenue_filled_zero_days", 0), "PASS" if quality.get("coverage_complete") else "NOT VERIFIED"],
        ],
    )
    lines += [
        "",
        "### Trạng thái nghiệp vụ thực tế trong snapshot",
        "",
    ]
    lines += _table(
        ["Loại", "Phân bố"],
        [
            ["Order status", service.orders["order_status"].value_counts().to_dict()],
            ["Payment status", service.orders["payment_status"].value_counts().to_dict()],
            ["Revenue loại theo status", quality.get("revenue_excluded_status_counts", {})],
            ["Revenue loại theo payment", quality.get("revenue_excluded_payment_counts", {})],
        ],
    )
    lines += [
        "",
        "Refund không áp dụng cùng một quy tắc cho mọi target: doanh thu giảm theo "
        "refund, còn completed order item vẫn được giữ cho demand/consumption vì "
        "snapshot không có inventory event chứng minh món đã được hoàn nguyên.",
        "",
    ]
    if revenue_error:
        lines.append(f"- Independent revenue: **NOT VERIFIED** — {revenue_error}")
        return lines, None
    pipeline = service.history
    all_dates = sorted(set(independent.index) | set(pipeline.index))
    if not all_dates:
        lines.append("- Daily revenue: **NOT VERIFIED** — không có ngày đối chiếu.")
        return lines, None
    sample = [all_dates[0], all_dates[-1]]
    zero_dates = [day for day in all_dates if independent.get(day, 0) == 0]
    if zero_dates:
        sample.append(zero_dates[len(zero_dates) // 2])
    sample.append(all_dates[len(all_dates) // 2])
    sample = list(dict.fromkeys(sample))
    rows = []
    deltas = []
    for day in sample:
        independent_value = float(independent.get(day, 0.0))
        pipeline_value = float(pipeline.get(day, 0.0))
        delta = independent_value - pipeline_value
        deltas.append(abs(delta))
        rows.append([
            day.date(),
            int((independent_rows["business_date"] == day).sum()),
            _fmt(independent_value, 4),
            _fmt(pipeline_value, 4),
            _fmt(delta, 12),
            _status(abs(delta) <= TOLERANCE),
        ])
    lines += [
        "### Đối chiếu ngày mẫu",
        "",
        *_table(
            ["Ngày", "Số order accepted", "Doanh thu tính lại", "Daily series pipeline", "Sai lệch", "Trạng thái"],
            rows,
        ),
        "",
    ]
    order_ids_unique = not service.orders["order_id"].duplicated().any()
    item_join = service.order_items.merge(
        service.orders[["order_id", "order_status"]],
        on="order_id",
        how="inner",
        validate="many_to_one",
    )
    lines += _table(
        ["Kiểm tra", "Kết quả", "Trạng thái"],
        [
            ["Order id duplicate", not order_ids_unique, _status(order_ids_unique)],
            ["Order-item join rows", len(item_join), "PASS"],
            ["Revenue path join order-items", "Không join; dùng orders trực tiếp", "PASS"],
            ["Max daily arithmetic delta", _fmt(max(deltas) if deltas else None, 12), _status(bool(deltas) and max(deltas) <= TOLERANCE)],
        ],
    )
    lines += [
        "",
        "Ngày không bán được fill 0 chỉ trong khoảng snapshot có coverage_complete=true. "
        "Ngày thiếu dữ liệu/outage không được tự coi là không bán; live snapshot thiếu "
        "cờ coverage sẽ bị từ chối.",
    ]
    return lines, bool(deltas) and max(deltas) <= TOLERANCE


def _feature_proof(service: RevenueForecastService) -> tuple[list[str], bool]:
    history = service.history
    frame = make_training_frame(history)
    if frame.empty:
        return [
            "## 5. Kiểm chứng features",
            "",
            "Feature frame rỗng vì lịch sử chưa đủ lag/rolling; baseline có thể vẫn "
            "phục vụ nhưng feature/model tree: **NOT VERIFIED**.",
        ], False
    lines = [
        "## 5. Kiểm chứng features",
        "",
        f"Feature frame có {len(frame)} rows từ {frame.index.min().date()} đến {frame.index.max().date()}; "
        f"{len(history) - len(frame)} ngày đầu bị loại vì lag/rolling chưa đủ dữ liệu.",
        "",
        "Pipeline reference: make_training_frame trong src/app/forecasting/features.py. "
        "Tính lại độc lập bằng công thức shift trước rolling.",
        "",
    ]
    targets = [frame.index[-2], frame.index[-1]] if len(frame) >= 2 else list(frame.index)
    rows = []
    checks: list[bool] = []
    feature_names = [
        "day_of_week",
        "day_of_month",
        "month",
        "day_of_year",
        "is_weekend",
        "lag_1",
        "lag_7",
        "lag_14",
        "rolling_mean_7",
        "rolling_mean_28",
    ]
    for target in targets:
        manual = _manual_feature_values(history, target)
        for feature in feature_names:
            if feature in manual:
                recalculated = manual[feature]
            else:
                recalculated = {
                    "day_of_week": target.dayofweek,
                    "day_of_month": target.day,
                    "month": target.month,
                    "day_of_year": target.dayofyear,
                    "is_weekend": int(target.dayofweek >= 5),
                }[feature]
            pipeline = float(frame.loc[target, feature])
            delta = float(recalculated) - pipeline
            used = _feature_inputs(target, feature)
            if feature == "lag_1":
                used_dates = [target - pd.Timedelta(days=1)]
            elif feature == "lag_7":
                used_dates = [target - pd.Timedelta(days=7)]
            elif feature == "lag_14":
                used_dates = [target - pd.Timedelta(days=14)]
            elif feature == "rolling_mean_7":
                used_dates = [target - pd.Timedelta(days=offset) for offset in range(1, 8)]
            elif feature == "rolling_mean_28":
                used_dates = [target - pd.Timedelta(days=offset) for offset in range(1, 29)]
            else:
                used_dates = []
            no_future = all(day < target for day in used_dates)
            ok = abs(delta) <= TOLERANCE and no_future
            checks.append(ok)
            rows.append([
                target.date(),
                feature,
                used,
                _fmt(recalculated, 10),
                _fmt(pipeline, 10),
                _fmt(delta, 12),
                _status(ok),
            ])
    lines += _table(
        ["Ngày", "Feature", "Dữ liệu dùng tính", "Tính lại", "Pipeline", "Sai lệch", "Trạng thái"],
        rows,
    )
    lines += [
        "",
        f"Feature target không dùng ngày tương lai: **{_status(all(checks) if checks else None)}**.",
        "Rolling dùng history.shift(1).rolling(...); target ngày T không nằm trong rolling window.",
    ]
    return lines, bool(checks) and all(checks)


def _demand_proof(
    service: RevenueForecastService,
    target: pd.Timestamp,
) -> tuple[list[str], dict[int, dict[str, Any]], bool | None]:
    items = service.order_items.copy()
    items = items[items["order_status"].eq("Completed")].copy()
    items["business_date"] = _local_dates(items["order_time"], service.timezone)
    items = items[items["business_date"] <= service.cutoff_date]
    pipeline = service.forecast_products(target.strftime("%Y-%m-%d"))
    pipeline_by_variant = {
        int(row["variant_id"]): row for row in pipeline["products"]
    }
    independent: dict[int, dict[str, Any]] = {}
    rows = []
    checks: list[bool] = []
    for (product_id, variant_id, product_name), group in items.groupby(
        ["product_id", "variant_id", "product_name"], dropna=False
    ):
        if pd.isna(variant_id):
            continue
        variant = int(variant_id)
        daily = group.groupby("business_date")["quantity"].sum().sort_index()
        index = pd.date_range(daily.index.min(), service.cutoff_date, freq="D")
        recent = daily.reindex(index, fill_value=0.0).tail(56)
        same_weekday = recent[recent.index.dayofweek == target.dayofweek]
        used = same_weekday if len(same_weekday) >= 4 else recent
        expected = float(used.mean()) if len(used) else 0.0
        reason = None if len(same_weekday) >= 4 and len(recent) >= 14 else (
            "sparse_weekday_history" if len(recent) >= 14 else "short_product_history"
        )
        independent[variant] = {
            "product_id": int(product_id),
            "variant_id": variant,
            "product_name": str(product_name),
            "expected": max(0.0, expected),
            "used_dates": list(used.index),
            "used_values": [float(value) for value in used],
            "reason": reason,
        }
        pipeline_row = pipeline_by_variant.get(variant)
        if pipeline_row is None:
            checks.append(False)
            pipeline_value = None
            delta = None
        else:
            pipeline_value = float(pipeline_row["predicted_quantity"])
            delta = expected - pipeline_value
            checks.append(abs(delta) <= TOLERANCE)
        rows.append([
            int(product_id),
            variant,
            str(product_name),
            _fmt(expected, 6),
            len(used),
            "; ".join(
                f"{day.strftime('%Y-%m-%d')}={_fmt(value, 3)}"
                for day, value in zip(used.index, used)
            ),
            _fmt(pipeline_value, 6),
            _fmt(delta, 12),
            _status(checks[-1]),
        ])
    lines = [
        "## 6. Kiểm chứng product/variant demand",
        "",
        "Demand dùng order_items đã join với Orders và chỉ giữ order_status=Completed. "
        "Refund payment không xóa consumption completed vì schema hiện không có bằng chứng "
        "inventory hoàn nguyên. Công thức demo/current: mean của tối đa 56 ngày gần cutoff "
        "cùng weekday; nếu dưới 4 mẫu weekday thì backoff về mean toàn recent.",
        "",
        *_table(
            [
                "product_id",
                "variant_id",
                "món",
                "demand tính lại",
                "mẫu số",
                "ngày/quantity đóng góp",
                "pipeline",
                "sai lệch",
                "trạng thái",
            ],
            rows,
        ),
        "",
        f"Branch demand: {service.branch_id}; số variant được đối chiếu: {len(independent)}.",
        "Không phân bổ product demand xuống variant trong live. Demo fixture map "
        "product_id sang variant_id vì recipes mock không có variant_id.",
    ]
    return lines, independent, bool(checks) and all(checks) if checks else None


def _inventory_proof(
    service: RevenueForecastService,
    target: pd.Timestamp,
    demand: dict[int, dict[str, Any]],
) -> tuple[list[str], bool | None]:
    pipeline = service.forecast_inventory(target.strftime("%Y-%m-%d"))
    pipeline_by_ingredient = {
        int(row["ingredient_id"]): row for row in pipeline["ingredients"]
    }
    inventory_by_id = {
        int(row.ingredient_id): row for row in service.inventory.itertuples(index=False)
    }
    rows = []
    checks: list[bool] = []
    for ingredient_id, pipeline_row in pipeline_by_ingredient.items():
        recipe_rows = service.recipes[
            service.recipes["ingredient_id"].astype(int) == ingredient_id
        ]
        usage = 0.0
        contributions = []
        missing: list[str] = []
        for recipe in recipe_rows.itertuples(index=False):
            variant_id = int(recipe.variant_id)
            if variant_id not in demand:
                missing.append(f"variant_id={variant_id} thiếu demand")
                continue
            inv = inventory_by_id.get(ingredient_id)
            if inv is None:
                missing.append("thiếu inventory")
                continue
            if str(recipe.unit) != str(inv.unit):
                missing.append(f"unit mismatch {recipe.unit}!={inv.unit}")
                continue
            contribution = float(demand[variant_id]["expected"]) * float(recipe.quantity_required)
            usage += contribution
            contributions.append(
                f"v{variant_id}: {demand[variant_id]['expected']:.3f}×{float(recipe.quantity_required):.3f}"
            )
        inv = inventory_by_id.get(ingredient_id)
        if inv is None:
            recomputed_purchase = None
            available = None
        else:
            available = float(inv.quantity_in_stock) - float(inv.reserved_quantity)
            recomputed_purchase = (
                max(0.0, usage + float(inv.reorder_level) - available)
                if not missing and recipe_rows is not None and len(recipe_rows) > 0
                else None
            )
        pipeline_usage = pipeline_row.get("forecast_usage")
        pipeline_purchase = pipeline_row.get("recommended_purchase")
        arithmetic_ok = (
            not missing
            and pipeline_usage is not None
            and abs(float(pipeline_usage) - usage) <= TOLERANCE
            and pipeline_purchase is not None
            and recomputed_purchase is not None
            and abs(float(pipeline_purchase) - recomputed_purchase) <= TOLERANCE
        )
        if missing and pipeline_row.get("status") == "insufficient_data":
            arithmetic_ok = True
        checks.append(arithmetic_ok)
        rows.append([
            ingredient_id,
            "; ".join(contributions) or "NOT VERIFIED",
            "; ".join(
                f"{variant_id}={demand[variant_id]['expected']:.3f}"
                for variant_id in sorted(demand)
                if any(int(value) == variant_id for value in recipe_rows["variant_id"])
            ) or "NOT VERIFIED",
            "; ".join(_fmt(value, 6) for value in recipe_rows["quantity_required"])
            or "NOT VERIFIED",
            "; ".join(str(value) for value in recipe_rows["unit"]) or "NOT VERIFIED",
            _fmt(usage, 6) if not missing else "NOT VERIFIED",
            _fmt(pipeline_usage, 6),
            _fmt(available, 6),
            _fmt(recomputed_purchase, 6),
            _status(arithmetic_ok),
        ])
    lines = [
        "## 7. Kiểm chứng recipe và inventory",
        "",
        "Công thức independent: forecast_usage = tổng expected_variant_quantity × "
        "recipe.quantity_required cùng unit. available_stock = quantity_in_stock - "
        "reserved_quantity. recommended_purchase = max(0, usage + reorder_level - "
        "available_stock). reorder_level chỉ được dùng như ngưỡng heuristic, không "
        "được gọi là safety stock/target stock.",
        "",
        *_table(
            [
                "nguyên liệu",
                "variant đóng góp",
                "demand",
                "recipe quantity",
                "đơn vị",
                "usage tính lại",
                "usage pipeline",
                "tồn khả dụng",
                "đề xuất mua tính lại",
                "trạng thái",
            ],
            rows,
        ),
        "",
        "Không áp dụng conversion, hao hụt, lead time, inbound, MOQ hoặc pack size vì "
        "snapshot/schema adapter hiện không cung cấp các trường đó. Reservation chỉ được "
        "trừ một lần trong available_stock; forecast demand bắt đầu sau cutoff.",
    ]
    return lines, bool(checks) and all(checks) if checks else None


def _backtest_proof(
    service: RevenueForecastService,
    requested_folds: int,
    horizon: int,
) -> tuple[list[str], dict[str, Any]]:
    evaluation = service.evaluation
    fold_details = evaluation.get("fold_details", [])
    selected = evaluation.get("selected_model")
    lines = [
        "## 8. Rolling-origin backtest",
        "",
        f"Backtest dùng {len(fold_details)} fold thực hiện trên cùng snapshot; requested folds={requested_folds}, "
        f"horizon={horizon}. Fold cuối là test độc lập; các fold trước là validation để chọn model.",
        "Không shuffle. Mỗi fold fit candidate trên train trước cutoff và forecast recursive "
        "horizon ngày. Signed error = forecast - actual.",
        "",
    ]
    if not fold_details:
        lines.append("Backtest: **NOT VERIFIED** — không đủ dữ liệu để tạo fold.")
        return lines, {"status": None, "selected": selected, "folds": []}
    baseline_a = "SeasonalNaive"
    baseline_b = "WeekdayMean8Weeks"
    daily_rows = []
    fold_summaries = []
    selected_actual: list[float] = []
    selected_predicted: list[float] = []
    baseline_actual: list[float] = []
    baseline_predicted: list[float] = []
    for index, fold in enumerate(fold_details):
        model_rows = fold["models"]
        selected_result = model_rows.get(selected, {})
        seasonal_result = model_rows.get(baseline_a, {})
        weekday_result = model_rows.get(baseline_b, {})
        actual = selected_result.get("actual", [])
        selected_pred = selected_result.get("predicted", [])
        seasonal_pred = seasonal_result.get("predicted", [])
        weekday_pred = weekday_result.get("predicted", [])
        for step, actual_value in enumerate(actual, start=1):
            selected_value = float(selected_pred[step - 1])
            seasonal_value = float(seasonal_pred[step - 1])
            weekday_value = float(weekday_pred[step - 1])
            target_date = pd.Timestamp(fold["test_start"]) + pd.Timedelta(days=step - 1)
            daily_rows.append([
                fold["fold"],
                fold["cutoff"],
                step,
                target_date.date(),
                _fmt(actual_value, 3),
                _fmt(selected_value, 3),
                _fmt(seasonal_value, 3),
                _fmt(weekday_value, 3),
                _fmt(selected_value - float(actual_value), 3),
                _fmt(seasonal_value - float(actual_value), 3),
                _fmt(weekday_value - float(actual_value), 3),
            ])
        selected_actual.extend(float(value) for value in actual)
        selected_predicted.extend(float(value) for value in selected_pred)
        baseline_actual.extend(float(value) for value in actual)
        baseline_predicted.extend(float(value) for value in weekday_pred)
        selected_metrics = _metrics(list(actual), list(selected_pred))
        seasonal_metrics = _metrics(list(actual), list(seasonal_pred))
        weekday_metrics = _metrics(list(actual), list(weekday_pred))
        fold_summaries.append([
            fold["fold"],
            fold["cutoff"],
            fold["test_start"],
            fold["test_end"],
            "test" if index == len(fold_details) - 1 else "validation",
            selected,
            _fmt(selected_metrics["mae"], 3),
            _fmt(selected_metrics["rmse"], 3),
            _fmt(selected_metrics["wape_percent"], 4),
            _fmt(selected_metrics["mean_signed_error"], 3),
            _fmt(weekday_metrics["mae"], 3),
        ])
    selected_metrics_all = _metrics(selected_actual, selected_predicted)
    baseline_metrics_all = _metrics(baseline_actual, baseline_predicted)
    last_test = fold_details[-1]
    test_selected = _metrics(
        last_test["models"][selected]["actual"],
        last_test["models"][selected]["predicted"],
    )
    test_seasonal = _metrics(
        last_test["models"][baseline_a]["actual"],
        last_test["models"][baseline_a]["predicted"],
    )
    test_weekday = _metrics(
        last_test["models"][baseline_b]["actual"],
        last_test["models"][baseline_b]["predicted"],
    )
    selected_better = (
        test_selected["mae"] is not None
        and test_weekday["mae"] is not None
        and test_selected["mae"] < test_weekday["mae"]
        and test_selected["mae"] < test_seasonal["mae"]
    )
    comparison_status = "PASS" if selected_better else "NOT VERIFIED"
    lines += [
        "### Từng ngày: model được chọn và baseline",
        "",
        *_table(
            [
                "fold",
                "cutoff",
                "horizon",
                "target",
                "actual",
                "forecast model",
                "seasonal naive",
                "weekday mean",
                "signed model",
                "signed seasonal",
                "signed weekday",
            ],
            daily_rows,
        ),
        "",
        "### Metrics từng fold",
        "",
        *_table(
            [
                "fold",
                "cutoff",
                "test start",
                "test end",
                "phase",
                "model",
                "MAE",
                "RMSE",
                "WAPE %",
                "mean signed error",
                "weekday baseline MAE",
            ],
            fold_summaries,
        ),
        "",
        "### Metrics tổng hợp",
        "",
        *_table(
            ["Đối tượng", "MAE", "RMSE", "WAPE %", "Mean signed error"],
            [
                [
                    selected,
                    _fmt(selected_metrics_all["mae"], 3),
                    _fmt(selected_metrics_all["rmse"], 3),
                    _fmt(selected_metrics_all["wape_percent"], 4),
                    _fmt(selected_metrics_all["mean_signed_error"], 3),
                ],
                [
                    "WeekdayMean8Weeks",
                    _fmt(baseline_metrics_all["mae"], 3),
                    _fmt(baseline_metrics_all["rmse"], 3),
                    _fmt(baseline_metrics_all["wape_percent"], 4),
                    _fmt(baseline_metrics_all["mean_signed_error"], 3),
                ],
            ],
        ),
        "",
        f"Test cuối: model={_fmt(test_selected['mae'], 3)} MAE; SeasonalNaive={_fmt(test_seasonal['mae'], 3)}; "
        f"WeekdayMean8Weeks={_fmt(test_weekday['mae'], 3)}.",
        f"So sánh model tốt hơn cả hai baseline trên test: **{comparison_status}**. "
        "Không đặt ngưỡng nghiệp vụ và không gọi 100%-WAPE là accuracy.",
        "Nếu model được chọn chính là WeekdayMean8Weeks, kết quả chỉ chứng minh baseline "
        "đang phù hợp hơn candidate tree trên snapshot; không phải model vượt baseline.",
    ]
    return lines, {
        "status": selected_better,
        "selected": selected,
        "folds": fold_details,
        "test_selected": test_selected,
        "test_seasonal": test_seasonal,
        "test_weekday": test_weekday,
    }


def _forecast_proof(
    service: RevenueForecastService,
    start: pd.Timestamp,
    days: int,
) -> tuple[list[str], bool]:
    pipeline = service.forecast(start.strftime("%Y-%m-%d"), days)
    independent = _independent_recursive_trace(service, start, days)
    pipeline_by_date = {
        pd.Timestamp(row["date"]): int(row["predicted_revenue_vnd"])
        for row in pipeline["forecast"]
    }
    lines = [
        "## 6. Đối chiếu forecast và multi-step",
        "",
        f"Forecast origin thực tế: {(service.cutoff_date + pd.Timedelta(days=1)).date()}; "
        f"requested start: {start.date()}; requested horizon: {days}; model: {service.model_name}.",
        "Warmup gap, nếu có, được recursive forecast từ cutoff nhưng không xuất hiện "
        "trong đoạn response yêu cầu. Chưa có actual tương lai nên đúng/sai forecast "
        "tương lai là NOT VERIFIED.",
        "",
    ]
    rows = []
    checks = []
    for item in independent:
        if item["is_warmup"]:
            continue
        date = item["date"]
        pipeline_value = pipeline_by_date.get(date)
        delta = (
            float(item["serialized"]) - float(pipeline_value)
            if pipeline_value is not None
            else None
        )
        ok = pipeline_value is not None and abs(delta) <= ROUNDING_TOLERANCE
        checks.append(ok)
        if isinstance(item["inputs"], dict):
            input_summary = "; ".join(
                f"{key}={_fmt(value, 3)}"
                for key, value in item["inputs"].items()
                if key in {"lag_1", "lag_7", "lag_14", "rolling_mean_7", "rolling_mean_28"}
            )
        else:
            input_summary = str(item["inputs"])
        rows.append([
            item["step"],
            item["date"].date(),
            "requested",
            input_summary,
            _fmt(item["raw"], 6),
            _fmt(item["safe_value"], 6),
            item["serialized"],
            pipeline_value if pipeline_value is not None else "NOT VERIFIED",
            _fmt(delta, 6),
            _status(ok),
        ])
    lines += _table(
        [
            "step",
            "target",
            "phase",
            "feature/input",
            "prediction raw",
            "after non-negative",
            "tính lại serialize",
            "service/API serialize",
            "sai lệch",
            "trạng thái",
        ],
        rows,
    )
    lines += [
        "",
        "Service compare là đối chiếu integration với cùng model đã fit; không phải "
        "bằng chứng độc lập cho chất lượng của RandomForest/ExtraTrees/tree.",
        "HTTP API POST /api/forecasting chưa được gọi trong công cụ này; direct service "
        "không được coi là HTTP end-to-end.",
    ]
    return lines, bool(checks) and all(checks)


def _command_line(args: argparse.Namespace, output: Path) -> str:
    parts = [
        "python",
        f'"{Path(__file__).resolve()}"',
        "--days",
        str(args.days),
        "--backtest-horizon",
        str(args.backtest_horizon),
        "--backtest-folds",
        str(args.backtest_folds),
    ]
    if args.branch_id is not None:
        parts += ["--branch-id", str(args.branch_id)]
    if args.start_date:
        parts += ["--start-date", str(args.start_date)]
    if args.source_mode:
        parts += ["--source-mode", args.source_mode]
    parts += ["--output", f'"{output}"']
    return " ".join(parts)


def _build_report(
    args: argparse.Namespace,
    service: RevenueForecastService,
    source_mode: str,
    start: pd.Timestamp,
    output_path: Path,
) -> str:
    data_lines, data_status = _data_proof(service, source_mode)
    feature_lines, feature_status = _feature_proof(service)
    demand_lines, demand_trace, demand_status = _demand_proof(service, start)
    inventory_lines, inventory_status = _inventory_proof(service, start, demand_trace)
    forecast_lines, forecast_status = _forecast_proof(service, start, args.days)
    backtest_lines, backtest = _backtest_proof(
        service,
        args.backtest_folds,
        args.backtest_horizon,
    )
    source_semantics_status = "NOT VERIFIED" if source_mode == "demo" else "PASS"
    lines = [
        "# Calculation Proof - Forecasting",
        "",
        "## 1. Kết luận",
        "",
        *_table(
            ["Hạng mục", "Kết luận", "Ý nghĩa"],
            [
                ["Snapshot/source load", "PASS", f"Đã dùng source_mode={source_mode}"],
                ["Nghiệp vụ revenue/schema", source_semantics_status, "Demo không chứng minh production DB semantics." if source_mode == "demo" else "Snapshot đã có contract backend."],
                ["Revenue source → daily series", _status(data_status), "Tính lại độc lập từ orders"],
                ["Lag/rolling/no future feature", _status(feature_status), "Đối chiếu trên cùng snapshot"],
                ["Multi-step/service integration", _status(forecast_status), "Sai lệch serialize cho phép 0.5 VND"],
                ["Product/variant demand", _status(demand_status), "Đối chiếu weekday samples và expected quantity"],
                ["Recipe/inventory arithmetic", _status(inventory_status), "Đối chiếu usage, stock, reorder heuristic"],
                ["Model tốt hơn baseline trên test", _status(backtest.get("status")), "Không đặt ngưỡng nghiệp vụ"],
                ["HTTP API", "NOT VERIFIED", "Chưa gọi server HTTP; direct service không phải HTTP smoke test"],
                ["Forecast tương lai đúng/sai", "NOT VERIFIED", "Chưa có actual sau cutoff"],
            ],
        ),
        "",
        "PASS ở đây chỉ chứng minh phép tính hoặc integration khớp implementation. "
        "Không đồng nghĩa forecast chính xác hoặc production-ready.",
        "",
        "## 2. Lệnh chạy, source và cấu hình",
        "",
        f"- Command: {_command_line(args, output_path)}",
        f"- Source mode thực tế: {source_mode}",
        f"- Source: {'data_mock CSV' if source_mode == 'demo' else 'Spring Boot operational snapshot API'}",
        f"- Branch: {service.branch_id}",
        f"- Timezone: {service.timezone}",
        f"- Data version: {service.data_version}",
        f"- Snapshot generated_at: {service.snapshot_generated_at or 'N/A'}",
        f"- Cutoff hoàn chỉnh: {service.cutoff_date.date()}",
        f"- Start date: {start.date()}",
        f"- Days: {args.days}",
        f"- Backtest horizon/folds: {args.backtest_horizon}/{args.backtest_folds}",
        f"- Model version: {service.model_version}",
        f"- Model được chọn: {service.model_name}",
        f"- Output: {output_path}",
        "",
        "## 3. Luồng và công thức thực tế",
        "",
        "- Route: api/routes/forecasting.py, các handler forecast, forecast_products, forecast_inventory.",
        "- Request/response schemas: forecasting/schemas.py.",
        "- Snapshot: forecasting/repository.py, ForecastingSnapshot, DemoForecastingRepository, OperationalForecastingRepository.",
        "- Validation: forecasting/preprocessing.py.",
        "- Revenue service: forecasting/service.py, RevenueForecastService._build_revenue_history và forecast.",
        "- Features: forecasting/features.py, make_training_frame và make_future_features.",
        "- Evaluation: forecasting/evaluation.py, rolling_origin_evaluation.",
        "- Cache: forecasting/service.py, get_forecast_service và clear_forecast_service_cache.",
        "",
        "Revenue: Completed + Paid dùng order_total_vnd; Partially_Refunded dùng "
        "order_total_vnd - refunded_amount_vnd; Refunded = 0. Ngày được chuyển về "
        "timezone branch trước khi group theo ngày.",
        "",
        "Revenue features: calendar, lag_1, lag_7, lag_14, "
        "rolling_mean_7 = mean(shift(1)[-7:]), "
        "rolling_mean_28 = mean(shift(1)[-28:]).",
        "",
        "Forecast multi-step: từng prediction được append vào history rồi dùng làm "
        "lag/rolling cho bước sau. Output revenue làm non-negative và round nearest "
        "integer ở bước phục vụ. Không có prediction interval được calibrate.",
        "",
        "Product demand: mean quantity của tối đa 56 ngày gần cutoff cùng weekday; "
        "dưới 4 mẫu weekday thì backoff recent mean. Inventory: "
        "usage = sum(expected_variant_quantity × recipe_quantity) cùng unit; "
        "purchase = max(0, usage + reorder_level - available_stock).",
        "",
        "Đối chiếu schema db_smart_cafe.txt: Orders/Order_Items, "
        "Recipes.variant_id, Inventories.branch_id/ingredient_id, Branches.timezone "
        "và AI_Forecasts. AI service không tự ghi database.",
        "",
        *data_lines,
        "",
        *feature_lines,
        "",
        *forecast_lines,
        "",
        *demand_lines,
        "",
        *inventory_lines,
        "",
        *backtest_lines,
        "",
        "## 9. Hạn chế và phần chưa xác minh",
        "",
        "- Demo dùng CSV tổng hợp; không chứng minh dữ liệu production hoặc hiệu quả thực tế.",
        "- Demo fixture không có variant_id thật; mapping product_id → variant_id chỉ là giới hạn fixture.",
        "- Live snapshot/backend endpoint phải cung cấp version, generated_at, complete_through, coverage_complete, timezone, branch và refund amount khi cần.",
        "- HTTP POST /api/forecasting chưa được gọi trong proof; cần server/credentials để kiểm tra serialization end-to-end.",
        "- Bảng AI_Forecasts chưa được ghi vì backend write contract chưa được triển khai.",
        "- Chưa bịa confidence/prediction interval; forecast tương lai chưa có actual.",
        "- WAPE dùng tổng absolute actual làm mẫu số; nếu bằng 0 phải ghi NOT VERIFIED, không dùng epsilon.",
        "",
    ]
    return chr(10).join(str(line) for line in lines) + chr(10)


def _error_report(
    args: argparse.Namespace,
    source_mode: str,
    output_path: Path,
    error: Exception,
) -> str:
    lines = [
        "# Calculation Proof - Forecasting",
        "",
        "## 1. Kết luận",
        "",
        "- Source load: **FAIL**.",
        "- Dữ liệu, feature, forecast và backtest: **NOT VERIFIED** vì chưa xây được snapshot.",
        "- Live mode không tự fallback sang demo.",
        "",
        "## 2. Lệnh và lỗi",
        "",
        f"- Command: {_command_line(args, output_path)}",
        f"- Source mode: {source_mode}",
        f"- Branch: {args.branch_id if args.branch_id is not None else 'N/A'}",
        f"- Error type: {type(error).__name__}",
        f"- Error: {error}",
        "",
        "Nếu muốn kiểm chứng fixture local, chạy lại với --source-mode demo tường minh. "
        "Kết quả demo không phải kết quả production.",
        "",
    ]
    return chr(10).join(lines) + chr(10)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--branch-id", type=int, default=None)
    parser.add_argument("--start-date", default=None)
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--backtest-horizon", type=int, default=7)
    parser.add_argument("--backtest-folds", type=int, default=3)
    parser.add_argument("--source-mode", choices=["live", "demo"], default=None)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    if not 1 <= args.days <= 90:
        parser.error("--days phải nằm trong khoảng 1 đến 90")
    if not 1 <= args.backtest_horizon <= 30:
        parser.error("--backtest-horizon phải nằm trong khoảng 1 đến 30")
    if not 2 <= args.backtest_folds <= 10:
        parser.error("--backtest-folds phải nằm trong khoảng 2 đến 10")
    if args.branch_id is not None and args.branch_id < 1:
        parser.error("--branch-id phải lớn hơn 0")
    return args


def _print_report(report: str) -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    print(report)


def main() -> int:
    args = _parse_args()
    output_path = (
        args.output
        if args.output.is_absolute()
        else (Path.cwd() / args.output).resolve()
    )
    source_mode = args.source_mode or get_forecasting_settings().source_mode
    try:
        service, actual_source_mode, start = _build_context(args)
        report = _build_report(args, service, actual_source_mode, start, output_path)
    except (
        ForecastingBranchRequired,
        ForecastingDataQualityError,
        ForecastingDataUnavailable,
        FileNotFoundError,
        ValueError,
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
