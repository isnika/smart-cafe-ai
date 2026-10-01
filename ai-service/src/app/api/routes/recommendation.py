from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.recommendation.service import RecommendationService


router = APIRouter(
    prefix="/api/recommendation",
    tags=["Recommendation"]
)


class RecommendationRequest(BaseModel):
    user_id: str
    top_k: int = Field(default=5, ge=1, le=50)


@router.post("")
def recommend(request: RecommendationRequest):

    service = RecommendationService()

    recommendations = service.recommend(
        user_id=request.user_id,
        top_k=request.top_k
    )

    return {
        "user_id": request.user_id,
        "recommendations": recommendations
    }