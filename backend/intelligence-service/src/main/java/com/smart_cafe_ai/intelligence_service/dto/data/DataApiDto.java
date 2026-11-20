package com.smart_cafe_ai.intelligence_service.dto.data;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

public class DataApiDto {

    // --- 1. Catalog Search ---
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CatalogSearchResponse {
        private List<LiveProduct> products;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LiveProduct {
        private Integer id;
        private String name;
        private String description;
        private String temperature;

        @JsonProperty("caffeine_level")
        private String caffeineLevel;

        @JsonProperty("flavor_tags")
        private List<String> flavorTags;

        @JsonProperty("branch_name")
        private String branchName;

        @JsonProperty("updated_at")
        private String updatedAt;

        private List<LiveVariant> variants;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LiveVariant {
        private Integer id;

        @JsonProperty("variant_name")
        private String variantName;

        private Long price;

        @JsonProperty("is_available")
        private Boolean isAvailable;

        @JsonProperty("unavailable_reason")
        private String unavailableReason;
    }

    // --- 2. Order Lookup ---
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OrderLookupResponse {
        @JsonProperty("order_code")
        private String orderCode;

        private String status;

        @JsonProperty("payment_status")
        private String paymentStatus;

        @JsonProperty("fulfillment_type")
        private String fulfillmentType;

        @JsonProperty("branch_name")
        private String branchName;

        @JsonProperty("updated_at")
        private String updatedAt;
    }

    // --- 3. Recommendation Snapshot & Viewer ---
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ViewerResponse {
        @JsonProperty("user_id")
        private String userId;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RecommendationSnapshot {
        private String version;

        @JsonProperty("generated_at")
        private String generatedAt;

        private List<SnapshotProduct> products;
        private List<SnapshotInteraction> interactions;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SnapshotProduct {
        @JsonProperty("product_id")
        private Integer productId;

        private String name;
        private String category;
        private String description;
        private String temperature;

        @JsonProperty("caffeine_level")
        private String caffeineLevel;

        @JsonProperty("flavor_tags")
        private List<String> flavorTags;

        @JsonProperty("price_vnd")
        private Long priceVnd;

        @JsonProperty("is_active")
        private Boolean isActive;

        @JsonProperty("is_available")
        private Boolean isAvailable;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SnapshotInteraction {
        @JsonProperty("user_id")
        private String userId;

        @JsonProperty("product_id")
        private Integer productId;

        private Integer quantity;

        @JsonProperty("n_orders")
        private Integer nOrders;

        @JsonProperty("last_purchase")
        private String lastPurchase;

        private Integer rating;
    }

    // --- 4. Forecasting Snapshot ---
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ForecastingSnapshot {
        private String version;

        @JsonProperty("generated_at")
        private String generatedAt;

        @JsonProperty("complete_through")
        private String completeThrough;

        @JsonProperty("coverage_complete")
        private Boolean coverageComplete;

        private String timezone;

        private List<SnapshotOrder> orders;

        @JsonProperty("order_items")
        private List<SnapshotOrderItem> orderItems;

        private List<SnapshotRecipe> recipes;

        private List<SnapshotInventory> inventory;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SnapshotOrder {
        @JsonProperty("order_id")
        private String orderId;

        @JsonProperty("branch_id")
        private Integer branchId;

        @JsonProperty("order_time")
        private String orderTime;

        @JsonProperty("order_total_vnd")
        private Long orderTotalVnd;

        @JsonProperty("order_status")
        private String orderStatus;

        @JsonProperty("payment_status")
        private String paymentStatus;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SnapshotOrderItem {
        @JsonProperty("order_id")
        private String orderId;

        @JsonProperty("branch_id")
        private Integer branchId;

        @JsonProperty("product_id")
        private Integer productId;

        @JsonProperty("variant_id")
        private Integer variantId;

        @JsonProperty("product_name")
        private String productName;

        private Integer quantity;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SnapshotRecipe {
        @JsonProperty("branch_id")
        private Integer branchId;

        @JsonProperty("variant_id")
        private Integer variantId;

        @JsonProperty("ingredient_id")
        private Integer ingredientId;

        @JsonProperty("ingredient_name")
        private String ingredientName;

        @JsonProperty("quantity_required")
        private Double quantityRequired;

        private String unit;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SnapshotInventory {
        @JsonProperty("branch_id")
        private Integer branchId;

        @JsonProperty("ingredient_id")
        private Integer ingredientId;

        @JsonProperty("ingredient_name")
        private String ingredientName;

        private String unit;

        @JsonProperty("quantity_in_stock")
        private Double quantityInStock;

        @JsonProperty("reserved_quantity")
        private Double reservedQuantity;

        @JsonProperty("reorder_level")
        private Double reorderLevel;
    }
}
