"""Temporal evaluation for the explicit demo recommendation snapshot.

This script deliberately uses only the mock order files and labels its output
as demo data. It is not a production KPI job.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import tempfile
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "src" / "app" / "recommendation" / "data_mock"
sys.path.insert(0, str(ROOT))

from src.app.recommendation.service.recommendation_service import RecommendationService


def _ndcg(recommended: list[int], relevant: set[int], k: int) -> float:
    hits = [
        index
        for index, product_id in enumerate(recommended[:k], start=1)
        if product_id in relevant
    ]
    dcg = sum(1 / math.log2(index + 1) for index in hits)
    ideal_hits = min(k, len(relevant))
    idcg = sum(1 / math.log2(index + 1) for index in range(1, ideal_hits + 1))
    return dcg / idcg if idcg else 0.0


def _scores(recommendations: list[dict], relevant: set[int], k: int) -> dict[str, float]:
    product_ids = [int(item["product_id"]) for item in recommendations[:k]]
    hits = sum(product_id in relevant for product_id in product_ids)
    return {
        "precision_at_k": hits / k,
        "recall_at_k": hits / len(relevant) if relevant else 0.0,
        "ndcg_at_k": _ndcg(product_ids, relevant, k),
    }


def _mean(rows: list[dict[str, float]]) -> dict[str, float]:
    if not rows:
        return {"precision_at_k": 0.0, "recall_at_k": 0.0, "ndcg_at_k": 0.0}
    return {
        key: round(sum(row[key] for row in rows) / len(rows), 6)
        for key in ("precision_at_k", "recall_at_k", "ndcg_at_k")
    }


def evaluate(days: int, top_k: int) -> dict:
    products = pd.read_csv(DATA_DIR / "products.csv", encoding="utf-8-sig")
    orders = pd.read_csv(
        DATA_DIR / "orders.csv",
        encoding="utf-8-sig",
        parse_dates=["order_time"],
    )
    order_items = pd.read_csv(DATA_DIR / "order_items.csv", encoding="utf-8-sig")
    latest_order = orders["order_time"].max()
    cutoff = latest_order - pd.Timedelta(days=days)
    train_orders = orders[orders["order_time"] < cutoff]
    test_orders = orders[orders["order_time"] >= cutoff]
    train_items = train_orders[["order_id", "user_id", "order_time"]].merge(
        order_items,
        on="order_id",
        how="inner",
    )
    test_items = test_orders[["order_id", "user_id", "order_time"]].merge(
        order_items,
        on="order_id",
        how="inner",
    )
    train_summary = (
        train_items.groupby(["user_id", "product_id"], as_index=False)
        .agg(
            quantity=("quantity", "sum"),
            n_orders=("order_id", "nunique"),
            last_purchase=("order_time", "max"),
        )
    )
    train_summary["rating"] = pd.NA
    train_summary = train_summary[
        ["user_id", "product_id", "quantity", "rating", "n_orders", "last_purchase"]
    ]

    with tempfile.TemporaryDirectory() as directory:
        snapshot_dir = Path(directory)
        products.to_csv(snapshot_dir / "products.csv", index=False)
        train_summary.to_csv(snapshot_dir / "user_item_summary.csv", index=False)
        service = RecommendationService(
            data_dir=snapshot_dir,
            as_of=cutoff,
            trending_window_days=days,
        )
        popularity, _ = service._popular_scores()
        popularity = [
            int(product_id)
            for product_id, _ in sorted(
                popularity.items(),
                key=lambda pair: (-pair[1], int(pair[0])),
            )
        ]
        train_users = set(train_summary["user_id"].astype(str))
        discovery_rows: list[dict[str, float]] = []
        discovery_baseline_rows: list[dict[str, float]] = []
        repeat_rows: list[dict[str, float]] = []
        evaluated_discovery_users = 0
        evaluated_repeat_users = 0

        for user_id, group in test_items.groupby("user_id"):
            user_id = str(user_id)
            if user_id not in train_users:
                continue
            purchased = set(
                train_summary.loc[
                    train_summary["user_id"].astype(str) == user_id,
                    "product_id",
                ].astype(int)
            )
            future = set(group["product_id"].astype(int))
            novel = future - purchased
            repeat = future & purchased

            if novel:
                evaluated_discovery_users += 1
                recommendations = service.recommend(
                    user_id=user_id,
                    mode="personalized",
                    discovery=True,
                    top_k=top_k,
                )
                discovery_rows.append(_scores(recommendations, novel, top_k))
                baseline_ids = [
                    product_id
                    for product_id in popularity
                    if product_id not in purchased
                ][:top_k]
                discovery_baseline_rows.append(_scores(
                    [{"product_id": product_id} for product_id in baseline_ids],
                    novel,
                    top_k,
                ))

            if repeat:
                evaluated_repeat_users += 1
                recommendations = service.recommend(
                    user_id=user_id,
                    mode="reorder",
                    top_k=top_k,
                )
                repeat_rows.append(
                    _scores(recommendations, repeat, top_k)
                )

    return {
        "data_source": "demo_mock",
        "cutoff": cutoff.isoformat(),
        "days": days,
        "top_k": top_k,
        "train_orders": len(train_orders),
        "test_orders": len(test_orders),
        "eligible_users": {
            "discovery_novel_future": evaluated_discovery_users,
            "reorder_repeat_future": evaluated_repeat_users,
        },
        "discovery": {
            "personalized_hybrid": _mean(discovery_rows),
            "popularity_baseline": _mean(discovery_baseline_rows),
        },
        "reorder": {
            "reorder_history": _mean(repeat_rows),
        },
        "notes": [
            "Train snapshot is built strictly before cutoff.",
            "Discovery ground truth excludes products already purchased before cutoff.",
            "Repeat purchases are evaluated separately with reorder strategy.",
            "Mock metrics are not production performance.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "evaluation" / "recommendation_metrics.json",
    )
    args = parser.parse_args()
    if args.days < 1 or args.top_k < 1 or args.top_k > 50:
        raise SystemExit("--days phải >= 1 và --top-k phải trong khoảng 1..50")
    result = evaluate(args.days, args.top_k)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
