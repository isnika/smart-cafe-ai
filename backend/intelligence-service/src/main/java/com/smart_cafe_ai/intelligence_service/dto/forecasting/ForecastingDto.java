package com.smart_cafe_ai.intelligence_service.dto.forecasting;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

public class ForecastingDto {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RevenueForecastRequest {
        @JsonProperty("start_date")
        private String startDate;

        private Integer days;

        @JsonProperty("branch_id")
        private Integer branchId;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RevenueForecastResponse {
        @JsonProperty("start_date")
        private String startDate;

        private Integer days;

        @JsonProperty("branch_id")
        private Integer branchId;

        private String currency;
        private String model;

        @JsonProperty("model_version")
        private String modelVersion;

        @JsonProperty("fallback_reason")
        private String fallbackReason;

        private Map<String, Object> metadata;

        private List<RevenueItem> forecast;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RevenueItem {
        private String date;

        @JsonProperty("predicted_revenue_vnd")
        private Long predictedRevenueVnd;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TargetDateRequest {
        @JsonProperty("target_date")
        private String targetDate;

        @JsonProperty("branch_id")
        private Integer branchId;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ProductForecastResponse {
        @JsonProperty("target_date")
        private String targetDate;

        @JsonProperty("branch_id")
        private Integer branchId;

        private List<ProductDemandItem> products;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ProductDemandItem {
        @JsonProperty("product_id")
        private Integer productId;

        @JsonProperty("variant_id")
        private Integer variantId;

        @JsonProperty("product_name")
        private String productName;

        @JsonProperty("predicted_quantity")
        private Double predictedQuantity;

        @JsonProperty("recommended_quantity")
        private Integer recommendedQuantity;

        @JsonProperty("fallback_reason")
        private String fallbackReason;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class InventoryForecastResponse {
        @JsonProperty("target_date")
        private String targetDate;

        @JsonProperty("branch_id")
        private Integer branchId;

        private List<IngredientUsageItem> ingredients;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class IngredientUsageItem {
        @JsonProperty("ingredient_id")
        private Integer ingredientId;

        @JsonProperty("ingredient_name")
        private String ingredientName;

        private String unit;

        @JsonProperty("available_stock")
        private Double availableStock;

        @JsonProperty("reorder_level")
        private Double reorderLevel;

        @JsonProperty("forecast_usage")
        private Double forecastUsage;

        @JsonProperty("recommended_purchase")
        private Double recommendedPurchase;

        private String status;

        @JsonProperty("missing_data")
        private List<String> missingData;
    }
}
