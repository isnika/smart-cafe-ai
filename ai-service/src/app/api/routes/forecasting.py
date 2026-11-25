from __future__ import annotations

from fastapi import APIRouter, HTTPException

from src.app.forecasting.config import get_forecasting_settings
from src.app.forecasting.exceptions import (
    ForecastingBranchRequired,
    ForecastingDataQualityError,
    ForecastingDataUnavailable,
)
from src.app.forecasting.schemas import (
    ForecastingRequest,
    ForecastMetadata,
    InventoryForecastResponse,
    ProductForecastResponse,
    RevenueForecastResponse,
    TargetDateRequest,
)
from src.app.forecasting.service import get_forecast_service

router = APIRouter(prefix="/api/forecasting", tags=["Forecasting"])


def _handle_error(exc: Exception) -> HTTPException:
    if isinstance(exc, (ForecastingDataUnavailable, ForecastingDataQualityError)):
        return HTTPException(status_code=503, detail="Forecasting data source unavailable or invalid.")
    if isinstance(exc, ForecastingBranchRequired):
        return HTTPException(status_code=400, detail="branch_id is required for forecasting.")
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail="Forecasting service failed.")


def _validate_metadata(payload: dict) -> dict:
    # Response models are also instantiated here so direct route returns and
    # HTTP serialization share the same contract validation.
    ForecastMetadata.model_validate(payload["metadata"])
    return payload


@router.post("", response_model=RevenueForecastResponse)
def forecast(
    request: ForecastingRequest,
):
    """Dự báo doanh thu từ ngày hoàn tất dữ liệu tiếp theo."""
    try:
        payload = get_forecast_service(
            branch_id=request.branch_id,
        ).forecast(request.start_date.isoformat(), request.days)
        return _validate_metadata(payload)
    except Exception as exc:
        raise _handle_error(exc) from exc


@router.post("/products", response_model=ProductForecastResponse)
def forecast_products(
    request: TargetDateRequest,
):
    """Dự báo expected quantity theo product/variant."""
    try:
        payload = get_forecast_service(
            branch_id=request.branch_id,
        ).forecast_products(request.target_date.isoformat())
        return _validate_metadata(payload)
    except Exception as exc:
        raise _handle_error(exc) from exc


@router.post("/inventory", response_model=InventoryForecastResponse)
def forecast_inventory(
    request: TargetDateRequest,
):
    """Tính usage nguyên liệu và recommended purchase theo recipe variant."""
    try:
        payload = get_forecast_service(
            branch_id=request.branch_id,
        ).forecast_inventory(request.target_date.isoformat(), request.days)
        return _validate_metadata(payload)
    except Exception as exc:
        raise _handle_error(exc) from exc
