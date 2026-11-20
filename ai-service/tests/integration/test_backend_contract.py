from __future__ import annotations

import asyncio
from dataclasses import replace

import httpx
import pytest

from src.app.chat.intent import Intent
from src.app.chat.live_data import OperationalDataClient
from src.app.core.config import get_settings
from src.app.forecasting.config import ForecastingSettings
from src.app.forecasting.exceptions import ForecastingDataQualityError, ForecastingDataUnavailable
from src.app.forecasting.repository import OperationalForecastingRepository
from src.app.recommendation.config import RecommendationSettings
from src.app.recommendation.exceptions import (
    RecommendationAuthorizationError,
    RecommendationSnapshotEmpty,
)
from src.app.recommendation.repository import OperationalRecommendationRepository


def _chat_settings():
    return replace(
        get_settings(),
        data_api_base_url="http://backend.test",
        data_api_key="service-secret",
        data_api_timeout_seconds=1.0,
        data_api_catalog_path="/api/ai/catalog/search",
        data_api_order_path="/api/ai/orders/{order_code}",
    )


def _recommendation_settings():
    return replace(
        RecommendationSettings.from_env(),
        data_api_base_url="http://backend.test",
        data_api_key="service-secret",
        data_api_timeout_seconds=1.0,
        snapshot_path="/api/ai/recommendation/snapshot",
        viewer_path="/api/ai/recommendation/viewer",
    )


def _forecasting_settings():
    return replace(
        ForecastingSettings.from_env(),
        data_api_base_url="http://backend.test",
        data_api_key="service-secret",
        data_api_timeout_seconds=1.0,
        snapshot_path="/api/ai/forecasting/snapshot",
        timezone="Asia/Ho_Chi_Minh",
    )


def _forecast_payload(*, coverage_complete: object = True) -> dict:
    return {
        "version": "orders-cursor-v1",
        "generated_at": "2026-11-14T10:00:00Z",
        "complete_through": "2026-11-14",
        "coverage_complete": coverage_complete,
        "timezone": "Asia/Ho_Chi_Minh",
        "orders": [
            {
                "order_id": "1001",
                "branch_id": 7,
                "order_time": "2026-11-14T03:00:00Z",
                "order_total_vnd": 120000,
                "order_status": "Completed",
                "payment_status": "Paid",
            }
        ],
        "order_items": [
            {
                "order_id": "1001",
                "branch_id": 7,
                "product_id": 3,
                "variant_id": 31,
                "product_name": "Matcha latte",
                "quantity": 2,
            }
        ],
        "recipes": [
            {
                "branch_id": 7,
                "variant_id": 31,
                "ingredient_id": 5,
                "ingredient_name": "Milk",
                "quantity_required": 250,
                "unit": "ml",
            }
        ],
        "inventory": [
            {
                "branch_id": 7,
                "ingredient_id": 5,
                "ingredient_name": "Milk",
                "unit": "ml",
                "quantity_in_stock": 12000,
                "reserved_quantity": 500,
                "reorder_level": 3000,
            }
        ],
    }


def test_catalog_search_contract_path_query_and_service_auth(monkeypatch):
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(
            200,
            json={
                "products": [
                    {
                        "product_id": 3,
                        "name": "Matcha latte",
                        "variants": [
                            {"variant_id": 31, "variant_name": "S", "price_vnd": 45000, "is_available": True},
                            {"variant_id": 32, "variant_name": "L", "price_vnd": 55000, "is_available": False},
                        ],
                    }
                ]
            },
            request=request,
        )

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        "src.app.chat.live_data.httpx.AsyncClient",
        lambda *args, **kwargs: real_client(*args, transport=transport, **kwargs),
    )

    result = asyncio.run(
        OperationalDataClient(_chat_settings()).search_catalog(
            "matcha", Intent.PRODUCT_PRICE, branch_id=1
        )
    )

    assert result is not None
    assert result.products[0].name == "Matcha latte"
    assert [variant.price for variant in result.products[0].variants] == [45000, 55000]
    request = calls[0]
    assert request.method == "GET"
    assert request.url.path == "/api/ai/catalog/search"
    assert dict(request.url.params) == {"q": "matcha", "intent": "product_price", "branch_id": "1"}
    assert request.headers["X-API-Key"] == "service-secret"
    assert "Authorization" not in request.headers


def test_order_lookup_contract_forwards_user_auth_and_hides_not_found(monkeypatch):
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(
            200,
            json={"data": {"order_code": "SC-123", "status": "Preparing", "payment_status": "Paid"}},
            request=request,
        )

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        "src.app.chat.live_data.httpx.AsyncClient",
        lambda *args, **kwargs: real_client(*args, transport=transport, **kwargs),
    )
    result = asyncio.run(
        OperationalDataClient(_chat_settings()).lookup_order("SC-123", "Bearer user-token")
    )

    assert result is not None and result.order_code == "SC-123"
    assert calls[0].method == "GET"
    assert calls[0].url.path == "/api/ai/orders/SC-123"
    assert calls[0].headers["Authorization"] == "Bearer user-token"
    assert calls[0].headers["X-API-Key"] == "service-secret"

    for status in (401, 403, 404):
        def error_handler(request: httpx.Request, status=status) -> httpx.Response:
            return httpx.Response(status, json={"secret_order_data": True}, request=request)

        monkeypatch.setattr(
            "src.app.chat.live_data.httpx.AsyncClient",
            lambda *args, error_handler=error_handler, **kwargs: real_client(
                *args, transport=httpx.MockTransport(error_handler), **kwargs
            ),
        )
        assert asyncio.run(
            OperationalDataClient(_chat_settings()).lookup_order("SC-123", "Bearer user-token")
        ) is None


def test_recommendation_viewer_uses_user_auth_and_preserves_401_403(monkeypatch):
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={"user_id": "user-uuid"}, request=request)

    transport = httpx.MockTransport(handler)
    real_client = httpx.Client
    monkeypatch.setattr(
        "src.app.recommendation.repository.httpx.Client",
        lambda *args, **kwargs: real_client(*args, transport=transport, **kwargs),
    )
    repository = OperationalRecommendationRepository(_recommendation_settings())
    assert repository.get_authorized_user_id("Bearer viewer-token") == "user-uuid"
    assert calls[0].url.path == "/api/ai/recommendation/viewer"
    assert calls[0].headers["Authorization"] == "Bearer viewer-token"
    assert calls[0].headers["X-API-Key"] == "service-secret"

    for status in (401, 403):
        def error_handler(request: httpx.Request, status=status) -> httpx.Response:
            return httpx.Response(status, json={"user_id": "other-user"}, request=request)

        monkeypatch.setattr(
            "src.app.recommendation.repository.httpx.Client",
            lambda *args, error_handler=error_handler, **kwargs: real_client(
                *args, transport=httpx.MockTransport(error_handler), **kwargs
            ),
        )
        with pytest.raises(RecommendationAuthorizationError) as exc_info:
            repository.get_authorized_user_id("Bearer viewer-token")
        assert exc_info.value.status_code == status


def test_recommendation_snapshot_maps_data_and_distinguishes_valid_empty(monkeypatch):
    payload = {
        "data": {
            "version": "snapshot-v1",
            "generated_at": "2026-11-14T10:00:00Z",
            "products": [
                {"product_id": 3, "name": "Matcha latte", "price_vnd": 55000, "is_active": True, "is_available": True}
            ],
            "interactions": [],
        }
    }
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json=payload, request=request)

    transport = httpx.MockTransport(handler)
    real_client = httpx.Client
    monkeypatch.setattr(
        "src.app.recommendation.repository.httpx.Client",
        lambda *args, **kwargs: real_client(*args, transport=transport, **kwargs),
    )
    repository = OperationalRecommendationRepository(_recommendation_settings())
    snapshot = repository.load_snapshot(branch_id=7, authorization="Bearer user-token")
    assert snapshot.version == "snapshot-v1"
    assert snapshot.products.iloc[0]["product_id"] == 3
    assert calls[0].url.path == "/api/ai/recommendation/snapshot"
    assert dict(calls[0].url.params) == {"branch_id": "7"}
    assert calls[0].headers["X-API-Key"] == "service-secret"
    assert "Authorization" not in calls[0].headers

    def empty_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"version": "empty-v1", "products": [], "interactions": []}, request=request)

    monkeypatch.setattr(
        "src.app.recommendation.repository.httpx.Client",
        lambda *args, **kwargs: real_client(
            *args, transport=httpx.MockTransport(empty_handler), **kwargs
        ),
    )
    with pytest.raises(RecommendationSnapshotEmpty):
        repository.load_snapshot(branch_id=7)


def test_forecasting_snapshot_maps_contract_and_uses_only_service_auth(monkeypatch):
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json=_forecast_payload(), request=request)

    transport = httpx.MockTransport(handler)
    real_client = httpx.Client
    monkeypatch.setattr(
        "src.app.forecasting.repository.httpx.Client",
        lambda *args, **kwargs: real_client(*args, transport=transport, **kwargs),
    )
    repository = OperationalForecastingRepository(_forecasting_settings())
    snapshot = repository.load_snapshot(branch_id=7, authorization="Bearer user-token")

    assert snapshot.branch_id == 7
    assert snapshot.timezone == "Asia/Ho_Chi_Minh"
    assert snapshot.version == "orders-cursor-v1"
    assert snapshot.quality["coverage_complete"] is True
    assert calls[0].url.path == "/api/ai/forecasting/snapshot"
    assert dict(calls[0].url.params) == {"branch_id": "7"}
    assert calls[0].headers["X-API-Key"] == "service-secret"
    assert "Authorization" not in calls[0].headers


def test_forecasting_snapshot_rejects_incomplete_wrong_branch_and_transport_errors(monkeypatch):
    real_client = httpx.Client

    def incomplete_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_forecast_payload(coverage_complete=False), request=request)

    monkeypatch.setattr(
        "src.app.forecasting.repository.httpx.Client",
        lambda *args, **kwargs: real_client(
            *args, transport=httpx.MockTransport(incomplete_handler), **kwargs
        ),
    )
    repository = OperationalForecastingRepository(_forecasting_settings())
    with pytest.raises(ForecastingDataQualityError):
        repository.load_snapshot(branch_id=7)

    wrong_branch = _forecast_payload()
    wrong_branch["orders"][0]["branch_id"] = 8

    def wrong_branch_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=wrong_branch, request=request)

    monkeypatch.setattr(
        "src.app.forecasting.repository.httpx.Client",
        lambda *args, **kwargs: real_client(
            *args, transport=httpx.MockTransport(wrong_branch_handler), **kwargs
        ),
    )
    with pytest.raises(ForecastingDataQualityError):
        repository.load_snapshot(branch_id=7)

    def malformed_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=["not-an-object"], request=request)

    monkeypatch.setattr(
        "src.app.forecasting.repository.httpx.Client",
        lambda *args, **kwargs: real_client(
            *args, transport=httpx.MockTransport(malformed_handler), **kwargs
        ),
    )
    with pytest.raises(ForecastingDataQualityError):
        repository.load_snapshot(branch_id=7)

    def timeout_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("backend timeout", request=request)

    monkeypatch.setattr(
        "src.app.forecasting.repository.httpx.Client",
        lambda *args, **kwargs: real_client(
            *args, transport=httpx.MockTransport(timeout_handler), **kwargs
        ),
    )
    with pytest.raises(ForecastingDataUnavailable):
        repository.load_snapshot(branch_id=7)
