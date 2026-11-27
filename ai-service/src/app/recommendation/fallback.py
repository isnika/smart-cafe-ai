"""Local fallback rankings for the chat recommendation use-case.

The offline training pipeline already normalizes products and user/item
interactions.  This module deliberately reads the raw order files as well:
the chat fallback needs a seven-day ranking, which cannot be reconstructed
from the long-lived user-item aggregate alone.
"""

from __future__ import annotations

import logging
import threading
import time
from pathlib import Path
from typing import Any

import pandas as pd

from src.app.recommendation.preprocessing.preprocessing import load_products

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = BASE_DIR / "data_mock"

_CACHE: dict[tuple[Any, ...], tuple[float, dict[str, list[dict[str, Any]]]]] = {}
_CACHE_LOCK = threading.Lock()


def _normalise_columns(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    result.columns = result.columns.astype(str).str.strip().str.lower()
    aliases = {
        "id": "product_id",
        "order_date": "order_time",
        "created_at": "order_time",
        "ordered_at": "order_time",
        "qty": "quantity",
        "count": "quantity",
    }
    for source, target in aliases.items():
        if source in result.columns and target not in result.columns:
            result = result.rename(columns={source: target})
    return result


def _read_csv(path: Path) -> pd.DataFrame:
    return _normalise_columns(pd.read_csv(path, encoding="utf-8-sig"))


def _available_products(products: pd.DataFrame) -> pd.DataFrame:
    result = products.copy()
    if "is_active" in result.columns:
        result = result[result["is_active"].fillna(True)]
    if "is_available" in result.columns:
        # Missing availability means that the source does not expose a stock
        # flag; it must not make every legacy mock product disappear.
        result = result[result["is_available"].isna() | result["is_available"].fillna(False)]
    return result.drop_duplicates("product_id").reset_index(drop=True)


def _not_cancelled(orders: pd.DataFrame) -> pd.Series:
    valid = pd.Series(True, index=orders.index)
    rejected = ("cancel", "reject", "fail", "void", "refund", "unpaid")
    for column in ("status", "order_status", "payment_status"):
        if column not in orders.columns:
            continue
        values = orders[column].fillna("").astype(str).str.strip().str.lower()
        valid &= ~values.str.contains("|".join(rejected), regex=True, na=False)
    for column in ("is_cancelled", "cancelled", "canceled"):
        if column not in orders.columns:
            continue
        values = orders[column].astype(str).str.strip().str.lower()
        valid &= ~values.isin({"1", "true", "yes", "y"})
    return valid


def _order_events(orders: pd.DataFrame, order_items: pd.DataFrame) -> pd.DataFrame:
    required_orders = {"order_id", "order_time"}
    required_items = {"order_id", "product_id", "quantity"}
    if not required_orders.issubset(orders.columns) or not required_items.issubset(order_items.columns):
        missing = sorted((required_orders - set(orders.columns)) | (required_items - set(order_items.columns)))
        raise ValueError(f"Order data thiếu các cột: {missing}")

    clean_orders = orders.loc[_not_cancelled(orders), ["order_id", "order_time"]].copy()
    clean_orders["order_id"] = clean_orders["order_id"].astype(str).str.strip()
    clean_orders["order_time"] = pd.to_datetime(clean_orders["order_time"], errors="coerce")
    clean_orders = clean_orders.dropna(subset=["order_id", "order_time"])

    clean_items = order_items[["order_id", "product_id", "quantity"]].copy()
    clean_items["order_id"] = clean_items["order_id"].astype(str).str.strip()
    clean_items["product_id"] = pd.to_numeric(clean_items["product_id"], errors="coerce")
    clean_items["quantity"] = pd.to_numeric(clean_items["quantity"], errors="coerce")
    clean_items = clean_items.dropna(subset=["order_id", "product_id", "quantity"])
    clean_items = clean_items[clean_items["quantity"] > 0]
    clean_items["product_id"] = clean_items["product_id"].astype(int)

    return clean_orders.merge(clean_items, on="order_id", how="inner")


def _item(row: pd.Series, sales_quantity: float, order_count: int) -> dict[str, Any]:
    product_id = int(row.get("product_id", row.name))
    price = int(row["price_vnd"])
    return {
        "id": product_id,
        "product_id": product_id,
        "name": str(row.get("name", "")),
        "price": price,
        "price_vnd": price,
        "description": str(row.get("description", "") or ""),
        "category": str(row.get("category", "") or ""),
        "image": str(row.get("image", "") or ""),
        "is_available": True,
        "sales_quantity": float(sales_quantity),
        "order_count": int(order_count),
    }


def _rank(
    products: pd.DataFrame,
    events: pd.DataFrame,
    *,
    as_of: pd.Timestamp,
    window_days: int | None,
) -> list[dict[str, Any]]:
    if window_days is not None:
        events = events[events["order_time"] >= as_of - pd.Timedelta(days=window_days)]
    if events.empty:
        return []
    valid_ids = set(products["product_id"].astype(int))
    events = events[events["product_id"].isin(valid_ids)]
    if events.empty:
        return []
    ranked = (
        events.groupby("product_id", as_index=False)
        .agg(sales_quantity=("quantity", "sum"), order_count=("order_id", "nunique"))
        .sort_values(["sales_quantity", "order_count", "product_id"], ascending=[False, False, True])
    )
    lookup = products.set_index("product_id")
    return [
        _item(lookup.loc[int(row.product_id)], row.sales_quantity, row.order_count)
        for row in ranked.itertuples(index=False)
    ]


def _file_signature(paths: tuple[Path, ...]) -> tuple[Any, ...]:
    signature: list[Any] = []
    for path in paths:
        try:
            stat = path.stat()
            signature.extend((str(path), stat.st_mtime_ns, stat.st_size))
        except OSError:
            signature.extend((str(path), None, None))
    return tuple(signature)


def _load_rankings(
    *,
    products_path: Path,
    orders_path: Path,
    order_items_path: Path,
    window_days: int = 7,
    as_of: pd.Timestamp | None = None,
    cache_ttl_seconds: int = 300,
) -> dict[str, list[dict[str, Any]]]:
    paths = (products_path, orders_path, order_items_path)
    cache_key = _file_signature(paths) + (int(window_days), str(as_of) if as_of is not None else "latest")
    now = time.monotonic()
    with _CACHE_LOCK:
        cached = _CACHE.get(cache_key)
        if cached and cached[0] > now:
            return {name: [dict(item) for item in items] for name, items in cached[1].items()}

    products = _available_products(load_products(products_path))
    events = _order_events(_read_csv(orders_path), _read_csv(order_items_path))
    if events.empty:
        rankings = {"trending": [], "best_seller": []}
    else:
        reference = pd.Timestamp(as_of) if as_of is not None else pd.Timestamp(events["order_time"].max())
        rankings = {
            "trending": _rank(products, events, as_of=reference, window_days=window_days),
            "best_seller": _rank(products, events, as_of=reference, window_days=None),
        }

    with _CACHE_LOCK:
        _CACHE[cache_key] = (now + max(1, int(cache_ttl_seconds)), rankings)
    return {name: [dict(item) for item in items] for name, items in rankings.items()}


class RecommendationFallback:
    """Cached trending and all-time rankings built from local order files."""

    def __init__(
        self,
        data_dir: Path | None = None,
        *,
        products_path: Path | None = None,
        orders_path: Path | None = None,
        order_items_path: Path | None = None,
        trending_window_days: int = 7,
        cache_ttl_seconds: int = 300,
        as_of: pd.Timestamp | None = None,
    ):
        directory = data_dir or DEFAULT_DATA_DIR
        self.products_path = products_path or directory / "products.csv"
        self.orders_path = orders_path or directory / "orders.csv"
        self.order_items_path = order_items_path or directory / "order_items.csv"
        self.trending_window_days = max(1, int(trending_window_days))
        self.cache_ttl_seconds = max(1, int(cache_ttl_seconds))
        self.as_of = as_of

    def _rankings(self) -> dict[str, list[dict[str, Any]]]:
        return _load_rankings(
            products_path=self.products_path,
            orders_path=self.orders_path,
            order_items_path=self.order_items_path,
            window_days=self.trending_window_days,
            as_of=self.as_of,
            cache_ttl_seconds=self.cache_ttl_seconds,
        )

    def trending(self, limit: int = 5) -> list[dict[str, Any]]:
        return self._rankings()["trending"][: max(1, int(limit))]

    def best_sellers(self, limit: int = 5) -> list[dict[str, Any]]:
        return self._rankings()["best_seller"][: max(1, int(limit))]


def clear_fallback_cache() -> None:
    with _CACHE_LOCK:
        _CACHE.clear()


def get_trending(
    limit: int = 5,
    *,
    data_dir: Path | None = None,
    as_of: pd.Timestamp | None = None,
) -> list[dict[str, Any]]:
    return RecommendationFallback(data_dir=data_dir, as_of=as_of).trending(limit)


def get_best_sellers(
    limit: int = 5,
    *,
    data_dir: Path | None = None,
    as_of: pd.Timestamp | None = None,
) -> list[dict[str, Any]]:
    return RecommendationFallback(data_dir=data_dir, as_of=as_of).best_sellers(limit)
