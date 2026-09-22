from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(
    prefix="/api/recommendation",
    tags=["Recommendation"]
)


class RecommendationRequest(BaseModel):
    user_id: int
    top_k: int = 5


@router.post("")
def recommend(request: RecommendationRequest):
    recommendations = [
        {
            "product_id": 2,
            "product_name": "Matcha Latte",
            "score": 0.92
        },
        {
            "product_id": 7,
            "product_name": "Iced Latte",
            "score": 0.87
        },
        {
            "product_id": 4,
            "product_name": "Cappuccino",
            "score": 0.81
        }
    ]

    return {
        "user_id": request.user_id,
        "recommendations": recommendations[:request.top_k]
    }