from src.app.recommendation.service.recommendation_service import RecommendationService


def test_known_user_gets_recommendations_and_excludes_purchased_items():
    service = RecommendationService()
    user_id = "U001"
    bought = set(service.interactions.loc[service.interactions["user_id"] == user_id, "product_id"].astype(int))
    results = service.recommend(user_id=user_id, top_k=5)

    assert results
    assert len(results) <= 5
    assert not bought.intersection(item["product_id"] for item in results)
    assert all("score" in item and 0 <= item["score"] <= 1 for item in results)
    assert any(item["recommendation_type"] != "Trending" for item in results)


def test_unknown_user_falls_back_to_popularity():
    service = RecommendationService()
    results = service.recommend(user_id="unknown-user", top_k=3)

    assert results
    assert all(item["recommendation_type"] == "Trending" for item in results)


def test_product_context_recommends_similar_items():
    service = RecommendationService()
    results = service.recommend(product_id=1, top_k=5)

    assert results
    assert all(item["product_id"] != 1 for item in results)
