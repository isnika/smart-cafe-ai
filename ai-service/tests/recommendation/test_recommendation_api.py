from fastapi.testclient import TestClient

from src.app.core.config import get_settings
from src.app.main import app
from src.app.recommendation.config import get_recommendation_settings
from src.app.recommendation.service.recommendation_service import (
    clear_recommendation_service_cache,
    get_recommendation_service,
)


client = TestClient(app)


def _clear_caches():
    clear_recommendation_service_cache()
    get_recommendation_settings.cache_clear()
    get_settings.cache_clear()


def test_demo_api_returns_strategy_reason_and_compatible_item_fields(monkeypatch):
    monkeypatch.setenv("RECOMMENDATION_SOURCE_MODE", "demo")
    _clear_caches()

    response = client.post(
        "/api/recommendation",
        json={"user_id": "U001", "mode": "personalized", "top_k": 3},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["strategy"] == "personalized"
    assert payload["fallback_reason"] is None
    assert payload["recommendations"]
    assert {"score", "reason_code", "strategy", "recommendation_type"} <= set(
        payload["recommendations"][0]
    )
    _clear_caches()


def test_live_mode_does_not_silently_fallback_to_demo(monkeypatch):
    monkeypatch.setenv("RECOMMENDATION_SOURCE_MODE", "live")
    monkeypatch.delenv("DATA_API_BASE_URL", raising=False)
    _clear_caches()

    response = client.post("/api/recommendation", json={"mode": "trending", "top_k": 3})

    assert response.status_code == 503
    assert "DATA_API_BASE_URL" in response.json()["detail"]
    _clear_caches()


def test_cache_clear_builds_a_new_snapshot_service(monkeypatch):
    monkeypatch.setenv("RECOMMENDATION_SOURCE_MODE", "demo")
    _clear_caches()

    first = get_recommendation_service(branch_id=7)
    assert get_recommendation_service(branch_id=7) is first
    clear_recommendation_service_cache(branch_id=7)
    second = get_recommendation_service(branch_id=7)

    assert second is not first
    _clear_caches()
