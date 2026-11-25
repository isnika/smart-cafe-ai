from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from src.app.recommendation.preprocessing.preprocessing import load_products, normalize_interactions


SUCCESS_STATUSES = {
    "completed",
    "complete",
    "paid",
    "success",
    "successful",
    "delivered",
    "fulfilled",
}
CANCELLED_STATUSES = {
    "cancelled",
    "canceled",
    "rejected",
    "pending_payment",
    "pending payment",
    "failed",
    "unpaid",
}


@dataclass(frozen=True)
class TemporalSplit:
    products: pd.DataFrame
    events: pd.DataFrame
    train: pd.DataFrame
    validation: pd.DataFrame
    test: pd.DataFrame
    train_end: pd.Timestamp
    validation_end: pd.Timestamp
    latest_event: pd.Timestamp
    source: str
    status_filter: str


def _columns(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()
    result.columns = result.columns.astype(str).str.strip().str.lower()
    aliases = {
        "timestamp": "order_time",
        "purchased_at": "order_time",
        "order_status": "status",
        "state": "status",
        "id": "order_id",
    }
    for source, target in aliases.items():
        if source in result.columns and target not in result.columns:
            result = result.rename(columns={source: target})
    return result


def _filter_completed_orders(orders: pd.DataFrame) -> tuple[pd.DataFrame, str]:
    status_column = next((name for name in ("status", "order_status", "payment_status") if name in orders), None)
    if status_column is None:
        return orders, "no_status_column_available"
    values = orders[status_column].fillna("").astype(str).str.strip().str.lower()
    if values.isin(SUCCESS_STATUSES).any():
        return orders[values.isin(SUCCESS_STATUSES)].copy(), f"filtered_{status_column}_success_only"
    return orders[~values.isin(CANCELLED_STATUSES)].copy(), f"filtered_{status_column}_excluding_cancelled"


def load_purchase_events(
    orders_path: str | Path,
    order_items_path: str | Path,
    ratings_path: str | Path | None = None,
    branch_id: int | None = None,
) -> tuple[pd.DataFrame, str]:
    """Load only purchase events available in the repository.

    The mock data has no order status, so the returned metadata explicitly
    records that cancellation/payment filtering could not be performed there.
    """

    orders = _columns(pd.read_csv(orders_path, encoding="utf-8-sig"))
    items = _columns(pd.read_csv(order_items_path, encoding="utf-8-sig"))
    required_orders = {"order_id", "user_id", "order_time"}
    required_items = {"order_id", "product_id", "quantity"}
    missing_orders = sorted(required_orders - set(orders.columns))
    missing_items = sorted(required_items - set(items.columns))
    if missing_orders:
        raise ValueError(f"Orders data thiếu cột: {missing_orders}")
    if missing_items:
        raise ValueError(f"Order items data thiếu cột: {missing_items}")

    orders, status_filter = _filter_completed_orders(orders)
    if branch_id is not None and "branch_id" in orders.columns:
        orders = orders[pd.to_numeric(orders["branch_id"], errors="coerce") == branch_id]
        status_filter += f";branch_id={branch_id}"

    orders = orders[["order_id", "user_id", "order_time"]].copy()
    orders["user_id"] = orders["user_id"].fillna("").astype(str).str.strip()
    orders["order_time"] = pd.to_datetime(orders["order_time"], errors="coerce")
    orders = orders.dropna(subset=["order_id", "order_time"])
    orders = orders[orders["user_id"] != ""]

    items["product_id"] = pd.to_numeric(items["product_id"], errors="coerce")
    items["quantity"] = pd.to_numeric(items["quantity"], errors="coerce")
    items = items.dropna(subset=["order_id", "product_id", "quantity"])
    items = items[items["quantity"] > 0].copy()
    items["product_id"] = items["product_id"].astype(int)

    events = orders.merge(items[["order_id", "product_id", "quantity"]], on="order_id", how="inner")
    events = (
        events.groupby(["order_id", "user_id", "order_time", "product_id"], as_index=False)
        .agg(quantity=("quantity", "sum"))
    )

    if ratings_path is not None and Path(ratings_path).exists():
        ratings = _columns(pd.read_csv(ratings_path, encoding="utf-8-sig"))
        required_ratings = {"user_id", "product_id", "rating"}
        if required_ratings.issubset(ratings.columns):
            ratings["product_id"] = pd.to_numeric(ratings["product_id"], errors="coerce")
            ratings["rating"] = pd.to_numeric(ratings["rating"], errors="coerce")
            ratings = ratings.dropna(subset=["user_id", "product_id", "rating"])
            ratings["user_id"] = ratings["user_id"].astype(str).str.strip()
            ratings = (
                ratings.groupby(["user_id", "product_id"], as_index=False)["rating"]
                .mean()
            )
            events = events.merge(ratings, on=["user_id", "product_id"], how="left")

    if "rating" not in events.columns:
        events["rating"] = pd.NA
    events["product_id"] = events["product_id"].astype(int)
    events["quantity"] = events["quantity"].astype(float)
    return events.sort_values(["order_time", "order_id", "product_id"]).reset_index(drop=True), status_filter


def aggregate_events(events: pd.DataFrame) -> pd.DataFrame:
    if events.empty:
        return pd.DataFrame(columns=["user_id", "product_id", "quantity", "rating", "n_orders", "last_purchase"])
    events = events.copy()
    if "rating" not in events.columns:
        events["rating"] = pd.NA
    events["rating"] = pd.to_numeric(events["rating"], errors="coerce")
    grouped = (
        events.assign(user_id=events["user_id"].astype(str))
        .groupby(["user_id", "product_id"], as_index=False)
        .agg(
            quantity=("quantity", "sum"),
            rating=("rating", "mean"),
            n_orders=("order_id", "nunique"),
            last_purchase=("order_time", "max"),
        )
    )
    return normalize_interactions(grouped)


def split_temporal(
    products: pd.DataFrame,
    events: pd.DataFrame,
    validation_days: int = 30,
    test_days: int = 30,
    source: str = "raw_purchase_events",
    status_filter: str = "unknown",
) -> TemporalSplit:
    if events.empty:
        raise ValueError("Không có purchase event hợp lệ để chia tập thời gian.")
    latest = pd.to_datetime(events["order_time"], errors="coerce").max()
    test_start = latest - pd.Timedelta(days=test_days)
    validation_start = test_start - pd.Timedelta(days=validation_days)
    train = events[events["order_time"] < validation_start].copy()
    validation = events[
        (events["order_time"] >= validation_start) & (events["order_time"] < test_start)
    ].copy()
    test = events[events["order_time"] >= test_start].copy()
    if train.empty or validation.empty or test.empty:
        raise ValueError(
            "Không đủ dữ liệu cho temporal split; cần event ở train, validation và test."
        )
    return TemporalSplit(
        products=products.copy(),
        events=events.copy(),
        train=train,
        validation=validation,
        test=test,
        train_end=validation_start,
        validation_end=test_start,
        latest_event=latest,
        source=source,
        status_filter=status_filter,
    )


def fingerprint(products: pd.DataFrame, events: pd.DataFrame) -> str:
    product_bytes = pd.util.hash_pandas_object(products.sort_values("product_id"), index=False).values.tobytes()
    event_bytes = pd.util.hash_pandas_object(
        events.sort_values(["order_time", "order_id", "product_id"]), index=False
    ).values.tobytes()
    return hashlib.sha256(product_bytes + event_bytes).hexdigest()[:16]


def load_training_data(
    products_path: str | Path,
    orders_path: str | Path,
    order_items_path: str | Path,
    ratings_path: str | Path | None = None,
    branch_id: int | None = None,
    validation_days: int = 30,
    test_days: int = 30,
) -> TemporalSplit:
    products = load_products(products_path)
    events, status_filter = load_purchase_events(
        orders_path,
        order_items_path,
        ratings_path=ratings_path,
        branch_id=branch_id,
    )
    valid_ids = set(products.loc[products["is_active"], "product_id"].astype(int))
    events = events[events["product_id"].isin(valid_ids)].copy()
    return split_temporal(
        products,
        events,
        validation_days=validation_days,
        test_days=test_days,
        status_filter=status_filter,
    )
