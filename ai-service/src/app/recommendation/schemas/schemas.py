from pydantic import BaseModel, Field


class RecommendationRequest(BaseModel):
    user_id: str | None = None
    product_id: int | None = None
    top_k: int = Field(default=5, ge=1, le=50)


class RecommendationItem(BaseModel):
    product_id: int
    name: str
    score: float
    reason: str
    recommendation_type: str


class RecommendationResponse(BaseModel):
    user_id: str | None
    product_id: int | None
    recommendations: list[RecommendationItem]
