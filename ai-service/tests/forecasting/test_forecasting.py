from __future__ import annotations

from dataclasses import replace

import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.app.api.routes import forecasting as forecasting_route
from src.app.forecasting.config import ForecastingSettings
from src.app.forecasting.exceptions import ForecastingDataUnavailable
from src.app.forecasting.features import make_future_features
from src.app.forecasting.repository import DemoForecastingRepository
from src.app.forecasting.service import (
    RevenueForecastService,
    clear_forecast_service_cache,
    get_forecast_service,
)


def _write_fixture(base, *, second_branch: bool = False, unit: str = "g"):
    dates = pd.date_range("2025-01-01", periods=90, freq="D")
    branches = [1, 2] if second_branch else [1]
    orders = []
    items = []
    for branch in branches:
        for offset, date in enumerate(dates, start=1):
            order_id = branch * 1000 + offset
            orders.append(
                {
                    "order_id": order_id,
                    "branch_id": branch,
                    "order_time": date.strftime("%Y-%m-%d 10:00:00"),
                    "order_status": "Completed",
                    "payment_status": "Paid",
                    "order_total_vnd": 100.0 if branch == 1 else 1000.0,
                }
            )
            items.append(
                {
                    "order_id": order_id,
                    "branch_id": branch,
                    "product_id": 1,
                    "product_name": "Espresso",
                    "quantity": 1 if branch == 1 else 10,
                    "order_date": date.strftime("%Y-%m-%d"),
                }
            )
    pd.DataFrame(orders).to_csv(base / "orders.csv", index=False)
    pd.DataFrame(items).to_csv(base / "order_items.csv", index=False)
    pd.DataFrame(
        [{
            "product_id": 1,
            "product_name": "Espresso",
            "ingredient_id": 1,
            "ingredient_name": "Coffee beans",
            "quantity_required": 2,
            "unit": unit,
        }]
    ).to_csv(base / "recipes.csv", index=False)
    inventory = [
        {
            "branch_id": branch,
            "ingredient_id": 1,
            "ingredient_name": "Coffee beans",
            "unit": "g",
            "quantity_in_stock": 100,
            "reserved_quantity": 20,
            "reorder_level": 10,
        }
        for branch in branches
    ]
    pd.DataFrame(inventory).to_csv(base / "inventory.csv", index=False)


def _settings() -> ForecastingSettings:
    return ForecastingSettings(
        source_mode="demo",
        data_api_base_url="",
        data_api_key="",
        data_api_timeout_seconds=1.0,
        snapshot_path="/unused",
        timezone="Asia/Ho_Chi_Minh",
        cache_ttl_seconds=60,
        model_version="test-forecast-v1",
        evaluation_initial_days=60,
        evaluation_horizon_days=3,
        evaluation_folds=2,
        evaluation_step_days=15,
    )


@pytest.fixture
def fixture_dir(tmp_path):
    _write_fixture(tmp_path)
    return tmp_path


@pytest.fixture
def fixture_service(fixture_dir):
    settings = _settings()
    snapshot = DemoForecastingRepository(fixture_dir, settings).load_snapshot(branch_id=1)
    return RevenueForecastService(snapshot=snapshot, settings=settings)


def test_revenue_is_branch_scoped_and_future_only(tmp_path):
    _write_fixture(tmp_path, second_branch=True)
    settings = _settings()
    repo = DemoForecastingRepository(tmp_path, settings)
    branch_one = RevenueForecastService(
        snapshot=repo.load_snapshot(branch_id=1), settings=settings
    )
    branch_two = RevenueForecastService(
        snapshot=repo.load_snapshot(branch_id=2), settings=settings
    )
    first = branch_one.forecast("2025-04-01", 1)
    second = branch_two.forecast("2025-04-01", 1)
    assert first["branch_id"] == 1
    assert second["branch_id"] == 2
    assert first["forecast"][0]["predicted_revenue_vnd"] < second["forecast"][0]["predicted_revenue_vnd"]
    with pytest.raises(ValueError, match="sau data_cutoff_date"):
        branch_one.forecast("2025-03-31", 1)


def test_inventory_uses_variant_recipe_and_available_stock(fixture_service):
    result = fixture_service.forecast_inventory("2025-04-01")
    ingredient = result["ingredients"][0]
    assert ingredient["status"] == "ok"
    assert ingredient["available_stock"] == 80
    assert ingredient["forecast_usage"] == 2
    assert ingredient["recommended_purchase"] == 0


def test_revenue_refund_and_demand_consumption_are_separate(tmp_path):
    _write_fixture(tmp_path)
    orders = pd.read_csv(tmp_path / "orders.csv")
    orders["refunded_amount_vnd"] = 0
    orders.loc[0, "payment_status"] = "Partially_Refunded"
    orders.loc[0, "refunded_amount_vnd"] = 25
    orders.loc[1, "payment_status"] = "Refunded"
    orders.loc[2, "order_status"] = "Cancelled"
    orders.to_csv(tmp_path / "orders.csv", index=False)
    settings = _settings()
    snapshot = DemoForecastingRepository(tmp_path, settings).load_snapshot(branch_id=1)
    service = RevenueForecastService(snapshot=snapshot, settings=settings)
    assert service.history.iloc[0] == 75
    assert service.history.iloc[1] == 0
    assert service.quality["revenue_excluded_status_counts"]["Cancelled"] == 1
    assert len(service._demand_rows()) == 89


def test_missing_calendar_day_is_zero_only_with_complete_snapshot(tmp_path):
    _write_fixture(tmp_path)
    orders = pd.read_csv(tmp_path / "orders.csv")
    items = pd.read_csv(tmp_path / "order_items.csv")
    missing_order = orders.iloc[20]["order_id"]
    orders = orders[orders["order_id"] != missing_order]
    items = items[items["order_id"] != missing_order]
    orders.to_csv(tmp_path / "orders.csv", index=False)
    items.to_csv(tmp_path / "order_items.csv", index=False)
    settings = _settings()
    service = RevenueForecastService(
        snapshot=DemoForecastingRepository(tmp_path, settings).load_snapshot(branch_id=1),
        settings=settings,
    )
    assert service.history.iloc[20] == 0
    assert service.quality["revenue_filled_zero_days"] == 1


def test_gap_after_cutoff_is_recursively_warmed_up(fixture_service):
    result = fixture_service.forecast("2025-04-03", 1)
    assert [row["date"] for row in result["forecast"]] == [pd.Timestamp("2025-04-03").date()]
    assert result["metadata"]["forecast_origin"] == pd.Timestamp("2025-04-01").date()


def test_unit_mismatch_is_not_silently_zeroed(tmp_path):
    _write_fixture(tmp_path, unit="ml")
    settings = _settings()
    snapshot = DemoForecastingRepository(tmp_path, settings).load_snapshot(branch_id=1)
    service = RevenueForecastService(snapshot=snapshot, settings=settings)
    ingredient = service.forecast_inventory("2025-04-01")["ingredients"][0]
    assert ingredient["status"] == "insufficient_data"
    assert ingredient["forecast_usage"] is None
    assert ingredient["recommended_purchase"] is None
    assert "unit mismatch" in " ".join(ingredient["missing_data"])


def test_missing_recipe_is_reported(tmp_path):
    _write_fixture(tmp_path)
    pd.DataFrame(
        [{
            "product_id": 99,
            "product_name": "Unknown",
            "ingredient_id": 1,
            "ingredient_name": "Coffee beans",
            "quantity_required": 2,
            "unit": "g",
        }]
    ).to_csv(tmp_path / "recipes.csv", index=False)
    settings = _settings()
    service = RevenueForecastService(
        snapshot=DemoForecastingRepository(tmp_path, settings).load_snapshot(branch_id=1),
        settings=settings,
    )
    result = service.forecast_inventory("2025-04-01")
    assert "variant_id=1 không có recipe" in result["missing_data"]


def test_http_contract_for_all_endpoints(fixture_service, monkeypatch):
    app = FastAPI()
    app.include_router(forecasting_route.router)
    monkeypatch.setattr(forecasting_route, "get_forecast_service", lambda **kwargs: fixture_service)
    client = TestClient(app)

    revenue = client.post(
        "/api/forecasting",
        json={"start_date": "2025-04-01", "days": 1, "branch_id": 1},
    )
    products = client.post(
        "/api/forecasting/products",
        json={"target_date": "2025-04-01", "branch_id": 1},
    )
    inventory = client.post(
        "/api/forecasting/inventory",
        json={"target_date": "2025-04-01", "branch_id": 1},
    )
    assert revenue.status_code == 200
    assert products.status_code == 200
    assert inventory.status_code == 200
    assert revenue.json()["metadata"]["branch_id"] == 1
    assert products.json()["products"][0]["variant_id"] == 1
    assert inventory.json()["ingredients"][0]["status"] == "ok"


def test_features_do_not_include_target_in_rolling_window():
    history = pd.Series(
        range(1, 40),
        index=pd.date_range("2025-01-01", periods=39, freq="D"),
        dtype=float,
    )
    target = pd.Timestamp("2025-02-09")
    row = make_future_features(target, history).iloc[0]
    assert row["lag_1"] == history.iloc[-1]
    assert row["rolling_mean_7"] == history.iloc[-7:].mean()
    assert row["rolling_mean_28"] == history.iloc[-28:].mean()


def test_live_failure_does_not_fallback_to_demo(monkeypatch):
    monkeypatch.setenv("FORECASTING_SOURCE_MODE", "live")
    monkeypatch.delenv("FORECASTING_DATA_API_BASE_URL", raising=False)
    monkeypatch.delenv("DATA_API_BASE_URL", raising=False)
    clear_forecast_service_cache()
    with pytest.raises(ForecastingDataUnavailable):
        get_forecast_service(branch_id=1)
    clear_forecast_service_cache()


def test_http_live_failure_is_503_not_demo(monkeypatch):
    app = FastAPI()
    app.include_router(forecasting_route.router)
    monkeypatch.setattr(
        forecasting_route,
        "get_forecast_service",
        lambda **kwargs: (_ for _ in ()).throw(
            ForecastingDataUnavailable("upstream unavailable")
        ),
    )
    response = TestClient(app).post(
        "/api/forecasting",
        json={"start_date": "2025-04-01", "days": 1, "branch_id": 1},
    )
    assert response.status_code == 503
    assert "upstream unavailable" not in response.text


def test_cache_refresh_rebuilds_when_forced(tmp_path, monkeypatch):
    _write_fixture(tmp_path)
    monkeypatch.setenv("FORECASTING_SOURCE_MODE", "demo")
    monkeypatch.setattr(
        "src.app.forecasting.service.DEMO_DATA_DIR",
        tmp_path,
    )
    monkeypatch.setenv("FORECASTING_EVALUATION_INITIAL_DAYS", "60")
    monkeypatch.setenv("FORECASTING_EVALUATION_HORIZON_DAYS", "3")
    monkeypatch.setenv("FORECASTING_EVALUATION_FOLDS", "2")
    monkeypatch.setenv("FORECASTING_EVALUATION_STEP_DAYS", "15")
    clear_forecast_service_cache()
    first = get_forecast_service(branch_id=1)
    cached = get_forecast_service(branch_id=1)
    assert cached is first
    orders = pd.read_csv(tmp_path / "orders.csv")
    orders.loc[0, "order_total_vnd"] = 999
    orders.to_csv(tmp_path / "orders.csv", index=False)
    refreshed = get_forecast_service(branch_id=1, force_refresh=True)
    assert refreshed is not first
    assert refreshed.data_version != first.data_version
    clear_forecast_service_cache()
