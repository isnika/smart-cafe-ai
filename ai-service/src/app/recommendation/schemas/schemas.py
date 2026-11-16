from typing import Literal

from pydantic import BaseModel, Field


RecommendationMode = Literal["personalized", "similar", "trending", "reorder"]


class RecommendationRequest(BaseModel):
    user_id: str | None = None
    product_id: int | None = None
    mode: RecommendationMode | None = Field(
        default=None,
        description="Nếu bỏ trống, service suy ra từ user_id/product_id để giữ tương thích.",
    )
    discovery: bool = Field(
        default=False,
        description="Personalized discovery loại sản phẩm đã mua; mặc định false để hỗ trợ mua lại.",
    )
    top_k: int = Field(default=5, ge=1, le=50)


class RecommendationItem(BaseModel):
    product_id: int
    name: str
    category: str = ""
    price_vnd: int | None = None
    image: str = ""
    score: float
    reason_code: str
    reason: str
    strategy: RecommendationMode
    recommendation_type: str


class RecommendationResponse(BaseModel):
    user_id: str | None
    product_id: int | None
    branch_id: int | None = None
    strategy: RecommendationMode
    fallback_reason: str | None = None
    discovery: bool = False
    model_version: str | None = None
    recommendations: list[RecommendationItem]
