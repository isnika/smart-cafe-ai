from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(
    prefix="/api/forecasting",
    tags=["Forecasting"]
)


class ForecastingRequest(BaseModel):
    start_date: str
    days: int = 7


@router.post("")
def forecast(request: ForecastingRequest):

    forecast_data = [
        {
            "date": "2026-09-23",
            "predicted_revenue": 3500000
        },
        {
            "date": "2026-09-24",
            "predicted_revenue": 3700000
        },
        {
            "date": "2026-09-25",
            "predicted_revenue": 3900000
        }
    ]

    return {
        "start_date": request.start_date,
        "days": request.days,
        "forecast": forecast_data
    }