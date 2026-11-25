"""Train and evaluate offline recommendation candidates.

Example (repository mock data):

    python scripts/train_recommendation.py
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.app.recommendation.training.pipeline import train_and_evaluate  # noqa: E402


def main() -> None:
    data_dir = ROOT / "src" / "app" / "recommendation" / "data_mock"
    parser = argparse.ArgumentParser(description="Offline recommendation model comparison")
    parser.add_argument("--products", type=Path, default=data_dir / "products.csv")
    parser.add_argument("--orders", type=Path, default=data_dir / "orders.csv")
    parser.add_argument("--order-items", type=Path, default=data_dir / "order_items.csv")
    parser.add_argument("--ratings", type=Path, default=data_dir / "ratings.csv")
    parser.add_argument(
        "--artifact-out",
        type=Path,
        default=ROOT / "artifacts" / "recommendation" / "selected.joblib",
    )
    parser.add_argument(
        "--metrics-out",
        type=Path,
        default=ROOT / "evaluation" / "recommendation_offline_metrics.json",
    )
    parser.add_argument("--model-version", default=None)
    parser.add_argument("--branch-id", type=int, default=None)
    parser.add_argument("--validation-days", type=int, default=30)
    parser.add_argument("--test-days", type=int, default=30)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--random-state", type=int, default=42)
    args = parser.parse_args()
    if args.validation_days < 1 or args.test_days < 1:
        raise SystemExit("--validation-days và --test-days phải >= 1")
    if not 1 <= args.top_k <= 50:
        raise SystemExit("--top-k phải trong khoảng 1..50")

    report = train_and_evaluate(
        products_path=args.products,
        orders_path=args.orders,
        order_items_path=args.order_items,
        ratings_path=args.ratings if args.ratings.exists() else None,
        artifact_path=args.artifact_out,
        metrics_path=args.metrics_out,
        model_version=args.model_version,
        branch_id=args.branch_id,
        validation_days=args.validation_days,
        test_days=args.test_days,
        top_k=args.top_k,
        random_state=args.random_state,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
