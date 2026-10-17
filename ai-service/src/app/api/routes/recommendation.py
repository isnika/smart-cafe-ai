from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.app.recommendation.service.recommendation_service import get_recommendation_service

router = APIRouter(prefix="/api/recommendation", tags=["Recommendation"])


class RecommendationRequest(BaseModel):
    user_id: str | None = None
    product_id: int | None = None
    top_k: int = Field(default=5, ge=1, le=50)


@router.post("")
def recommend(request: RecommendationRequest):
    # user_id enables personalization from purchase history. If omitted,
    # the service returns popular items for cold-start visitors.
    try:
        service = get_recommendation_service()
        recommendations = service.recommend(
            user_id=request.user_id,
            product_id=request.product_id,
            top_k=request.top_k,
        )
        return {
            "user_id": request.user_id,
            "product_id": request.product_id,
            "recommendations": recommendations,
        }
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
