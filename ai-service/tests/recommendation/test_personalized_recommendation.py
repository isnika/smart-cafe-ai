from pathlib import Path
import math

import pandas as pd

from src.app.recommendation.service.recommendation_service import RecommendationService


DATA_DIR = Path("src/app/recommendation/data_mock")


def test_known_user_discovery_excludes_purchased_items_and_is_explainable():
    service = RecommendationService(data_dir=DATA_DIR)
    user_id = "U001"
    bought = set(
        service.interactions.loc[
            service.interactions["user_id"] == user_id, "product_id"
        ].astype(int)
    )
    results = service.recommend(
        user_id=user_id,
        mode="personalized",
        discovery=True,
        top_k=5,
    )

    assert results
    assert len(results) <= 5
    assert not bought.intersection(item["product_id"] for item in results)
    assert all(0 <= item["score"] <= 1 for item in results)
    assert all(item["reason_code"] and item["strategy"] == "personalized" for item in results)


def test_personalized_default_allows_reorder_candidates():
    service = RecommendationService(data_dir=DATA_DIR)
    bought = set(
        service.interactions.loc[
            service.interactions["user_id"] == "U001", "product_id"
        ].astype(int)
    )
    results = service.recommend(user_id="U001", mode="personalized", top_k=50)

    assert results
    assert bought.intersection(item["product_id"] for item in results)


def test_unknown_user_falls_back_to_trending_with_reason():
    service = RecommendationService(data_dir=DATA_DIR)
    result = service.recommend_with_metadata(
        user_id="unknown-user",
        mode="personalized",
        top_k=3,
    )

    assert result.items
    assert result.strategy == "trending"
    assert result.fallback_reason == "no_user_history"
    assert all(item["strategy"] == "trending" for item in result.items)


def test_similar_mode_never_uses_trending_candidates():
    service = RecommendationService(data_dir=DATA_DIR)
    result = service.recommend_with_metadata(product_id=1, mode="similar", top_k=5)

    assert result.items
    assert result.strategy == "similar"
    assert all(item["product_id"] != 1 for item in result.items)
    assert all(item["strategy"] == "similar" for item in result.items)
    assert all(item["reason_code"] == "similar_product" for item in result.items)


def test_reorder_can_return_products_already_purchased():
    service = RecommendationService(data_dir=DATA_DIR)
    result = service.recommend_with_metadata(user_id="U001", mode="reorder", top_k=5)
    bought = set(
        service.interactions.loc[
            service.interactions["user_id"] == "U001", "product_id"
        ].astype(int)
    )

    assert result.strategy == "reorder"
    assert result.items
    assert bought.intersection(item["product_id"] for item in result.items)


def test_inactive_product_is_not_served(tmp_path):
    products = pd.read_csv(DATA_DIR / "products.csv")
    interactions = pd.read_csv(DATA_DIR / "user_item_summary.csv")
    products.loc[products["product_id"] == 1, "is_active"] = False
    products.to_csv(tmp_path / "products.csv", index=False)
    interactions.to_csv(tmp_path / "user_item_summary.csv", index=False)

    service = RecommendationService(data_dir=tmp_path)

    assert 1 not in service.product_ids


def test_quantity_is_capped_and_low_rating_reduces_preference_weight(tmp_path):
    products = pd.read_csv(DATA_DIR / "products.csv").head(2)
    products.to_csv(tmp_path / "products.csv", index=False)
    interactions = pd.DataFrame(
        [
            {
                "user_id": "low-rating",
                "product_id": 1,
                "quantity": 100,
                "rating": 1,
                "n_orders": 1,
                "last_purchase": "2026-01-01",
            },
            {
                "user_id": "capped",
                "product_id": 1,
                "quantity": 8,
                "rating": 3,
                "n_orders": 1,
                "last_purchase": "2026-01-01",
            },
        ]
    )
    interactions.to_csv(tmp_path / "user_item_summary.csv", index=False)
    service = RecommendationService(data_dir=tmp_path, as_of="2026-01-01")

    low_weight = service._user_history("low-rating").iloc[0]["preference_weight"]
    capped_weight = service._user_history("capped").iloc[0]["preference_weight"]
    uncapped_neutral = math.log1p(8) + 0.7 * math.log1p(1) + 0.1

    assert low_weight < uncapped_neutral
    assert low_weight < capped_weight
    assert capped_weight == uncapped_neutral
