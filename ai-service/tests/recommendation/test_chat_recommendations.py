from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from src.app.recommendation.chat_service import ChatRecommendationService
from src.app.recommendation.fallback import RecommendationFallback, clear_fallback_cache


class FakeOfflineService:
    def __init__(self, scores_by_user: dict[str, dict[str, float]]):
        self.offline_artifact = {"scores_by_user": scores_by_user}
        self.product_lookup = {
            1: {"name": "Món cá nhân", "price_vnd": 30000, "description": "Mô tả 1"},
            2: {"name": "Món khác", "price_vnd": 40000, "description": "Mô tả 2"},
        }

    def recommend_with_metadata(self, **kwargs):
        del kwargs
        return SimpleNamespace(
            strategy="personalized",
            items=[{"product_id": 1, "score": 0.9}],
        )


class FakeFallback:
    def __init__(self, trending, best_sellers):
        self._trending = trending
        self._best_sellers = best_sellers

    def trending(self, limit):
        return self._trending[:limit]

    def best_sellers(self, limit):
        return self._best_sellers[:limit]


def _item(product_id: int, name: str) -> dict:
    return {
        "id": product_id,
        "product_id": product_id,
        "name": name,
        "price": 30000,
        "description": "Mô tả",
    }


def test_user_with_precomputed_recommendation_uses_personalized():
    service = ChatRecommendationService(
        offline_service=FakeOfflineService({"U001": {"1": 0.9}}),
        fallback=FakeFallback([_item(2, "Trending")], [_item(2, "Best")]),
    )

    result = service.get_recommendations("U001", limit=5)

    assert result["source"] == "personalized"
    assert [item["id"] for item in result["items"]] == [1]


def test_new_user_falls_back_to_trending():
    service = ChatRecommendationService(
        offline_service=FakeOfflineService({"U001": {"1": 0.9}}),
        fallback=FakeFallback([_item(2, "Trending")], [_item(1, "Best")]),
    )

    result = service.get_recommendations("new-user", limit=5)

    assert result["source"] == "trending"


def test_anonymous_user_uses_trending():
    service = ChatRecommendationService(
        fallback=FakeFallback([_item(2, "Trending")], [_item(1, "Best")]),
    )

    result = service.get_recommendations(None, limit=5)

    assert result["source"] == "trending"


def test_empty_trending_falls_back_to_best_seller():
    service = ChatRecommendationService(
        fallback=FakeFallback([], [_item(1, "Best")]),
    )

    result = service.get_recommendations(None, limit=5)

    assert result["source"] == "best_seller"
    assert result["items"][0]["name"] == "Best"


def test_fallback_drops_unavailable_products_and_deduplicates(tmp_path: Path):
    (tmp_path / "products.csv").write_text(
        "product_id,name,category,description,price_vnd,is_active,is_available\n"
        "1,Available,Coffee,Good,30000,1,1\n"
        "2,Sold out,Coffee,Nope,30000,1,0\n"
        "3,Inactive,Coffee,Nope,30000,0,1\n",
        encoding="utf-8",
    )
    (tmp_path / "orders.csv").write_text(
        "order_id,user_id,order_time\n"
        "O1,U1,2026-01-10 10:00:00\n"
        "O2,U2,2026-01-10 11:00:00\n",
        encoding="utf-8",
    )
    (tmp_path / "order_items.csv").write_text(
        "order_id,product_id,quantity\n"
        "O1,1,1\n"
        "O1,2,99\n"
        "O2,1,2\n",
        encoding="utf-8",
    )
    clear_fallback_cache()
    fallback = RecommendationFallback(data_dir=tmp_path)

    trending = fallback.trending(5)
    best_sellers = fallback.best_sellers(5)

    assert [item["id"] for item in trending] == [1]
    assert [item["id"] for item in best_sellers] == [1]
    assert len({item["id"] for item in best_sellers}) == len(best_sellers)
