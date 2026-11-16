from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .exceptions import ForecastingDataQualityError


def _rename_aliases(frame: pd.DataFrame, aliases: dict[str, str]) -> pd.DataFrame:
    result = frame.copy()
    result.columns = result.columns.astype(str).str.strip().str.lower()
    for source, target in aliases.items():
        if source in result.columns and target not in result.columns:
            result = result.rename(columns={source: target})
    return result


def _require(frame: pd.DataFrame, columns: tuple[str, ...], label: str) -> None:
    missing = [column for column in columns if column not in frame.columns]
    if missing:
        raise ForecastingDataQualityError(
            f"{label} thiếu cột bắt buộc: {', '.join(missing)}"
        )


def _numeric(frame: pd.DataFrame, column: str) -> pd.Series:
    return pd.to_numeric(frame[column], errors="coerce")


def _branch_filter(frame: pd.DataFrame, branch_id: int) -> pd.DataFrame:
    result = frame.copy()
    if "branch_id" not in result.columns:
        result["branch_id"] = branch_id
    result["branch_id"] = _numeric(result, "branch_id")
    result = result.dropna(subset=["branch_id"])
    result["branch_id"] = result["branch_id"].astype(int)
    return result[result["branch_id"] == int(branch_id)].copy()


def normalize_orders(frame: pd.DataFrame, branch_id: int) -> tuple[pd.DataFrame, dict[str, Any]]:
    result = _rename_aliases(
        frame,
        {
            "id": "order_id",
            "created_at": "order_time",
            "status": "order_status",
            "final_amount": "order_total_vnd",
            "revenue_vnd": "order_total_vnd",
            "refunded_amount": "refunded_amount_vnd",
        },
    )
    _require(
        result,
        ("order_id", "branch_id", "order_time", "order_total_vnd"),
        "orders",
    )
    result = _branch_filter(result, branch_id)
    result["order_id"] = result["order_id"].astype(str).str.strip()
    result["order_time"] = pd.to_datetime(result["order_time"], errors="coerce")
    result["order_total_vnd"] = _numeric(result, "order_total_vnd")
    if "order_status" not in result.columns:
        result["order_status"] = "Completed"
    if "payment_status" not in result.columns:
        result["payment_status"] = "Paid"
    result["order_status"] = result["order_status"].fillna("").astype(str).str.strip()
    result["payment_status"] = result["payment_status"].fillna("").astype(str).str.strip()
    refund_available = "refunded_amount_vnd" in result.columns
    if refund_available:
        result["refunded_amount_vnd"] = _numeric(result, "refunded_amount_vnd")
    else:
        result["refunded_amount_vnd"] = np.nan
    invalid = (
        result["order_id"].eq("")
        | result["order_time"].isna()
        | ~np.isfinite(result["order_total_vnd"])
        | (result["order_total_vnd"] < 0)
        | (result["refunded_amount_vnd"].notna() & (~np.isfinite(result["refunded_amount_vnd"]) | (result["refunded_amount_vnd"] < 0)))
    )
    invalid_count = int(invalid.sum())
    result = result.loc[~invalid].copy()
    duplicate_count = int(result.duplicated(subset=["order_id"]).sum())
    if duplicate_count:
        raise ForecastingDataQualityError(
            f"orders có {duplicate_count} order_id trùng; snapshot không an toàn để tổng hợp."
        )
    result["order_total_vnd"] = result["order_total_vnd"].astype(float)
    return result.reset_index(drop=True), {
        "orders_invalid_removed": invalid_count,
        "orders_duplicate_ids": duplicate_count,
        "refund_amount_available": refund_available,
    }


def normalize_order_items(frame: pd.DataFrame, branch_id: int) -> tuple[pd.DataFrame, dict[str, Any]]:
    result = _rename_aliases(
        frame,
        {
            "id": "order_item_id",
            "item_id": "order_item_id",
            "order_date": "order_time",
            "purchased_at": "order_time",
            "qty": "quantity",
        },
    )
    _require(
        result,
        ("order_id", "branch_id", "product_id", "quantity"),
        "order_items",
    )
    result = _branch_filter(result, branch_id)
    result["order_id"] = result["order_id"].astype(str).str.strip()
    result["product_id"] = _numeric(result, "product_id")
    result["quantity"] = _numeric(result, "quantity")
    if "variant_id" in result.columns:
        result["variant_id"] = _numeric(result, "variant_id")
    else:
        result["variant_id"] = np.nan
    if "product_name" not in result.columns:
        result["product_name"] = ""
    result["product_name"] = result["product_name"].fillna("").astype(str).str.strip()
    if "order_time" in result.columns:
        result["order_time"] = pd.to_datetime(result["order_time"], errors="coerce")
    invalid = (
        result["order_id"].eq("")
        | result["product_id"].isna()
        | result["quantity"].isna()
        | ~np.isfinite(result["quantity"])
        | (result["quantity"] <= 0)
    )
    invalid_count = int(invalid.sum())
    result = result.loc[~invalid].copy()
    exact_duplicates = int(result.duplicated().sum())
    if exact_duplicates:
        result = result.drop_duplicates().copy()
    result["product_id"] = result["product_id"].astype(int)
    result["quantity"] = result["quantity"].astype(float)
    if result["variant_id"].notna().any():
        result["variant_id"] = result["variant_id"].astype("Int64")
    return result.reset_index(drop=True), {
        "order_items_invalid_removed": invalid_count,
        "order_items_exact_duplicates_removed": exact_duplicates,
    }


def normalize_recipes(frame: pd.DataFrame, branch_id: int) -> tuple[pd.DataFrame, dict[str, Any]]:
    result = _rename_aliases(
        frame,
        {"quantity": "quantity_required", "uom": "unit"},
    )
    _require(
        result,
        ("variant_id", "ingredient_id", "quantity_required", "unit"),
        "recipes",
    )
    result = _branch_filter(result, branch_id)
    result["variant_id"] = _numeric(result, "variant_id")
    result["ingredient_id"] = _numeric(result, "ingredient_id")
    result["quantity_required"] = _numeric(result, "quantity_required")
    result["unit"] = result["unit"].fillna("").astype(str).str.strip()
    if "ingredient_name" not in result.columns:
        result["ingredient_name"] = ""
    result["ingredient_name"] = result["ingredient_name"].fillna("").astype(str).str.strip()
    invalid = (
        result["variant_id"].isna()
        | result["ingredient_id"].isna()
        | result["quantity_required"].isna()
        | ~np.isfinite(result["quantity_required"])
        | (result["quantity_required"] <= 0)
        | result["unit"].eq("")
    )
    invalid_count = int(invalid.sum())
    result = result.loc[~invalid].copy()
    result["variant_id"] = result["variant_id"].astype(int)
    result["ingredient_id"] = result["ingredient_id"].astype(int)
    result["quantity_required"] = result["quantity_required"].astype(float)
    return result.reset_index(drop=True), {"recipes_invalid_removed": invalid_count}


def normalize_inventory(frame: pd.DataFrame, branch_id: int) -> tuple[pd.DataFrame, dict[str, Any]]:
    result = _rename_aliases(
        frame,
        {
            "stock": "quantity_in_stock",
            "reserved": "reserved_quantity",
            "minimum_stock": "reorder_level",
        },
    )
    _require(
        result,
        (
            "branch_id",
            "ingredient_id",
            "ingredient_name",
            "unit",
            "quantity_in_stock",
            "reserved_quantity",
            "reorder_level",
        ),
        "inventory",
    )
    result = _branch_filter(result, branch_id)
    for column in ("ingredient_id", "quantity_in_stock", "reserved_quantity", "reorder_level"):
        result[column] = _numeric(result, column)
    result["ingredient_name"] = result["ingredient_name"].fillna("").astype(str).str.strip()
    result["unit"] = result["unit"].fillna("").astype(str).str.strip()
    invalid = (
        result["ingredient_id"].isna()
        | result["unit"].eq("")
        | result[["quantity_in_stock", "reserved_quantity", "reorder_level"]].isna().any(axis=1)
        | ~np.isfinite(result[["quantity_in_stock", "reserved_quantity", "reorder_level"]]).all(axis=1)
        | (result[["quantity_in_stock", "reserved_quantity", "reorder_level"]] < 0).any(axis=1)
    )
    invalid_count = int(invalid.sum())
    result = result.loc[~invalid].copy()
    result["ingredient_id"] = result["ingredient_id"].astype(int)
    return result.reset_index(drop=True), {"inventory_invalid_removed": invalid_count}
