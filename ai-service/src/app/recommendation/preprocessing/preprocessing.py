from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd


PRODUCT_COLUMNS = (
    "product_id",
    "name",
    "category",
    "description",
    "price_vnd",
    "temperature",
    "caffeine_level",
    "flavor_tags",
    "launch_date",
)
INTERACTION_COLUMNS = (
    "user_id",
    "product_id",
    "quantity",
    "rating",
    "n_orders",
    "last_purchase",
)


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()
    result.columns = result.columns.astype(str).str.strip().str.lower()
    aliases = {
        "id": "product_id",
        "product_name": "name",
        "category_name": "category",
        "price": "price_vnd",
        "interaction": "quantity",
        "order_count": "n_orders",
        "purchased_at": "last_purchase",
    }
    for source, target in aliases.items():
        if source in result.columns and target not in result.columns:
            result = result.rename(columns={source: target})
    return result


def _as_text(value: Any) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    if isinstance(value, (list, tuple, set)):
        return "|".join(str(item).strip() for item in value if str(item).strip())
    return str(value).strip()


def _as_bool(value: Any, default: bool | None = None) -> bool | None:
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
    return default


def normalize_products(df: pd.DataFrame) -> pd.DataFrame:
    """Validate and normalize catalog rows from CSV or the backend adapter."""

    result = _normalize_columns(df)
    if result.empty:
        return pd.DataFrame(columns=[*PRODUCT_COLUMNS, "content", "is_active", "is_available"])

    if "product_id" not in result.columns or "name" not in result.columns:
        raise ValueError("Products data thiếu cột product_id hoặc name")

    defaults = {
        "category": "",
        "description": "",
        "temperature": "",
        "caffeine_level": "",
        "flavor_tags": "",
        "launch_date": pd.NaT,
    }
    for column, default in defaults.items():
        if column not in result.columns:
            result[column] = default
    if "price_vnd" not in result.columns:
        raise ValueError("Products data thiếu cột price_vnd/price")

    result["product_id"] = pd.to_numeric(result["product_id"], errors="coerce")
    result["price_vnd"] = pd.to_numeric(result["price_vnd"], errors="coerce")
    result = result.dropna(subset=["product_id", "price_vnd"])
    result["product_id"] = result["product_id"].astype(int)
    result = result[result["price_vnd"] > 0]
    result["price_vnd"] = result["price_vnd"].astype(int)

    for column in (
        "name",
        "category",
        "description",
        "temperature",
        "caffeine_level",
        "flavor_tags",
    ):
        result[column] = result[column].map(_as_text)

    result["launch_date"] = pd.to_datetime(result["launch_date"], errors="coerce")

    status = result.get("status", pd.Series("Active", index=result.index))
    category_status = result.get("category_status", pd.Series("Active", index=result.index))
    active = result.get("is_active")
    if active is None:
        active = status.map(lambda value: _as_bool(value, True))
    else:
        active = active.map(lambda value: _as_bool(value, True))
    active = active.fillna(True).astype(bool)
    active &= category_status.map(lambda value: _as_bool(value, True)).fillna(True).astype(bool)
    result["is_active"] = active

    available = result.get("is_available")
    if available is None:
        result["is_available"] = pd.Series(pd.NA, index=result.index, dtype="boolean")
    else:
        result["is_available"] = available.map(lambda value: _as_bool(value)).astype("boolean")

    result = result.drop_duplicates(subset=["product_id"], keep="first")
    result["content"] = (
        result["name"]
        + " "
        + result["category"]
        + " "
        + result["description"]
        + " "
        + result["temperature"]
        + " "
        + result["caffeine_level"]
        + " "
        + result["flavor_tags"].str.replace("|", " ", regex=False)
    ).str.strip()
    return result.sort_values("product_id").reset_index(drop=True)


def normalize_interactions(df: pd.DataFrame) -> pd.DataFrame:
    """Validate interaction aggregates without inventing preference signals."""

    result = _normalize_columns(df)
    if result.empty:
        return pd.DataFrame(columns=INTERACTION_COLUMNS)

    required = ("user_id", "product_id", "quantity", "n_orders", "last_purchase")
    missing = [column for column in required if column not in result.columns]
    if missing:
        raise ValueError(f"Interactions data thiếu các cột: {missing}")
    if "rating" not in result.columns:
        result["rating"] = pd.NA

    result["user_id"] = result["user_id"].fillna("").astype(str).str.strip()
    result["product_id"] = pd.to_numeric(result["product_id"], errors="coerce")
    result["quantity"] = pd.to_numeric(result["quantity"], errors="coerce")
    result["n_orders"] = pd.to_numeric(result["n_orders"], errors="coerce")
    result["rating"] = pd.to_numeric(result["rating"], errors="coerce")
    result["last_purchase"] = pd.to_datetime(result["last_purchase"], errors="coerce")
    result = result.dropna(subset=["product_id", "quantity", "n_orders", "last_purchase"])
    result = result[result["user_id"] != ""]
    result = result[(result["quantity"] > 0) & (result["n_orders"] > 0)]
    result["product_id"] = result["product_id"].astype(int)
    result["quantity"] = result["quantity"].astype(float)
    result["n_orders"] = result["n_orders"].astype(float)
    result.loc[~result["rating"].between(1, 5), "rating"] = pd.NA
    result = (
        result.groupby(["user_id", "product_id"], as_index=False)
        .agg(
            quantity=("quantity", "sum"),
            rating=("rating", "mean"),
            n_orders=("n_orders", "sum"),
            last_purchase=("last_purchase", "max"),
        )
        .sort_values(["user_id", "product_id"])
        .reset_index(drop=True)
    )
    return result[list(INTERACTION_COLUMNS)]


def load_products(file_path: str | Path) -> pd.DataFrame:
    return normalize_products(pd.read_csv(file_path, encoding="utf-8-sig"))


def load_interactions(file_path: str | Path) -> pd.DataFrame:
    return normalize_interactions(pd.read_csv(file_path, encoding="utf-8-sig"))


def prepare_data(
    products_path: str | Path,
    interactions_path: str | Path,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    return load_products(products_path), load_interactions(interactions_path)
