from fastapi import APIRouter, Header, HTTPException

from src.app.recommendation.config import get_recommendation_settings
from src.app.recommendation.exceptions import (
    RecommendationAuthorizationError,
    RecommendationDataUnavailable,
)
from src.app.recommendation.repository import OperationalRecommendationRepository
from src.app.recommendation.schemas.schemas import (
    RecommendationRequest,
    RecommendationResponse,
)
from src.app.recommendation.service.recommendation_service import get_recommendation_service

router = APIRouter(prefix="/api/recommendation", tags=["Recommendation"])


@router.post("", response_model=RecommendationResponse)
def recommend(
    request: RecommendationRequest,
    authorization: str | None = Header(default=None),
    x_branch_id: int | None = Header(default=None, ge=1),
):
    settings = get_recommendation_settings()
    effective_mode = request.mode
    if effective_mode is None:
        if request.product_id is not None and request.user_id is None:
            effective_mode = "similar"
        elif request.user_id is not None:
            effective_mode = "personalized"
        elif authorization and settings.source_mode == "live":
            effective_mode = "personalized"
        else:
            effective_mode = "trending"

    effective_user_id = request.user_id
    try:
        if effective_mode in {"personalized", "reorder"} and settings.source_mode == "live":
            if not authorization:
                raise HTTPException(
                    status_code=401,
                    detail="Cần đăng nhập để lấy recommendation cá nhân hóa.",
                )
            authorized_user_id = OperationalRecommendationRepository(
                settings
            ).get_authorized_user_id(authorization)
            if request.user_id and request.user_id != authorized_user_id:
                raise HTTPException(
                    status_code=403,
                    detail="user_id không thuộc tài khoản đang đăng nhập.",
                )
            effective_user_id = authorized_user_id

        service = get_recommendation_service(branch_id=x_branch_id)
        result = service.recommend_with_metadata(
            user_id=effective_user_id,
            product_id=request.product_id,
            top_k=request.top_k,
            mode=effective_mode,
            discovery=request.discovery,
        )
        return RecommendationResponse(
            user_id=effective_user_id if effective_mode in {"personalized", "reorder"} else None,
            product_id=request.product_id,
            branch_id=x_branch_id,
            strategy=result.strategy,
            fallback_reason=result.fallback_reason,
            discovery=request.discovery,
            model_version=service.model_version,
            recommendations=result.items,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RecommendationAuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except RecommendationDataUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
