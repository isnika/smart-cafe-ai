from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ForecastingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_date: date
    days: int = Field(default=1, ge=1, le=90)
    branch_id: int | None = Field(default=None, ge=1)


class TargetDateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_date: date
    days: int = Field(default=1, ge=1, le=90)
    branch_id: int | None = Field(default=None, ge=1)


class ForecastMetadata(BaseModel):
    branch_id: int
    source_mode: Literal["live", "demo"]
    data_version: str
    snapshot_generated_at: datetime | None = None
    data_cutoff_date: date
    forecast_origin: date
    horizon_days: int
    timezone: str
    model_version: str
    trained_at: datetime | None = None
    stale: bool = False
    refresh_error: str | None = None
    fallback_reason: str | None = None
    artifact_loaded: bool = False
    artifact_path: str | None = None
    training_window_start: date | None = None
    training_window_end: date | None = None
    feature_schema: list[str] = Field(default_factory=list)


class RevenueForecastPoint(BaseModel):
    date: date
    predicted_revenue_vnd: int = Field(ge=0)


class RevenueForecastResponse(BaseModel):
    start_date: date
    days: int
    branch_id: int
    currency: Literal["VND"]
    model: str
    model_version: str
    validation_mae_vnd: float | None = None
    validation_scores_mae_vnd: dict[str, float | None] = Field(default_factory=dict)
    validation_metrics: dict[str, dict[str, float | None]] = Field(default_factory=dict)
    test_metrics: dict[str, dict[str, float | None]] = Field(default_factory=dict)
    validation_method: str
    interval_available: bool = False
    interval_reason: str
    fallback_reason: str | None = None
    metadata: ForecastMetadata
    forecast: list[RevenueForecastPoint]


class ProductForecastItem(BaseModel):
    product_id: int
    variant_id: int | None = None
    product_name: str
    predicted_quantity: float = Field(ge=0)
    recommended_quantity: int = Field(ge=0)
    fallback_reason: str | None = None


class ProductForecastResponse(BaseModel):
    forecast_date: date
    branch_id: int
    method: str = "recent 8-week weekday mean"
    note: str = "Expected quantity; recommended_quantity is rounded for operational decisions."
    model: Literal["WeekdayMean8Weeks"]
    model_version: str
    source_mode: Literal["live", "demo"]
    data_cutoff_date: date
    timezone: str
    fallback_reason: str | None = None
    products: list[ProductForecastItem]
    metadata: ForecastMetadata


class IngredientForecastItem(BaseModel):
    ingredient_id: int
    ingredient_name: str
    unit: str
    available_stock: float | None = None
    reorder_level: float | None = None
    forecast_usage: float | None = None
    recommended_purchase: float | None = None
    status: Literal["ok", "insufficient_data"]
    missing_data: list[str] = Field(default_factory=list)
    method: Literal["rop_safety_stock", "heuristic_reorder_level"]
    daily_demand_mean: float | None = None
    daily_demand_std: float | None = None
    lead_time_days: float | None = None
    service_level: float | None = None
    safety_stock: float | None = None
    reorder_point: float | None = None
    days_of_cover: float | None = None
    reorder_alert: bool | None = None
    reason: str | None = None


class InventoryForecastResponse(BaseModel):
    forecast_date: date
    branch_id: int
    method: str = "predicted variant demand × Recipes.quantity_required"
    model: Literal["VariantDemandTimesRecipe"]
    model_version: str
    source_mode: Literal["live", "demo"]
    data_cutoff_date: date
    timezone: str
    coverage_horizon_days: int
    calculation_assumption: str
    fallback_reason: str | None = None
    missing_data: list[str] = Field(default_factory=list)
    ingredients: list[IngredientForecastItem]
    metadata: ForecastMetadata
