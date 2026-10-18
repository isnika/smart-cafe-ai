from datetime import date
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.app.forecasting.service import get_forecast_service

router = APIRouter(prefix="/api/forecasting", tags=["Forecasting"])


class ForecastingRequest(BaseModel):
    start_date: date
    days: int = Field(default=1, ge=1, le=90)


class TargetDateRequest(BaseModel):
    target_date: date


@router.post("")
def forecast(request: ForecastingRequest):
    """Dự đoán doanh thu theo ngày; mặc định 1 ngày kế tiếp."""
    try:
        return get_forecast_service().forecast(request.start_date.isoformat(), request.days)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/products")
def forecast_products(request: TargetDateRequest):
    """Dự đoán số lượng bán theo sản phẩm cho ngày mục tiêu."""
    try:
        return get_forecast_service().forecast_products(request.target_date.isoformat())
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=503 if isinstance(exc, FileNotFoundError) else 400, detail=str(exc)) from exc


@router.post("/inventory")
def forecast_inventory(request: TargetDateRequest):
    """Ước lượng nguyên liệu cần dùng và lượng mua thêm theo Recipes + Inventories."""
    try:
        return get_forecast_service().forecast_inventory(request.target_date.isoformat())
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=503 if isinstance(exc, FileNotFoundError) else 400, detail=str(exc)) from exc
