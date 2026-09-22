from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(
    prefix="/api/inventory",
    tags=["Inventory"]
)


class InventoryRequest(BaseModel):
    forecast_days: int = 7


@router.post("")
def inventory(request: InventoryRequest):

    items = [
        {
            "material": "Coffee Beans",
            "predicted_quantity": 2.5,
            "unit": "kg"
        },
        {
            "material": "Fresh Milk",
            "predicted_quantity": 15,
            "unit": "liters"
        },
        {
            "material": "Matcha Powder",
            "predicted_quantity": 0.8,
            "unit": "kg"
        }
    ]

    return {
        "forecast_days": request.forecast_days,
        "items": items
    }