from datetime import date
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.app.forecasting.service import get_forecast_service

router = APIRouter(prefix="/api/forecasting", tags=["Forecasting"])


class ForecastingRequest(BaseModel):
    start_date: date
    days: int = Field(default=7, ge=1, le=90)


@router.post("")
def forecast(request: ForecastingRequest):
    try:
        service = get_forecast_service()
        return service.forecast(request.start_date.isoformat(), request.days)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
