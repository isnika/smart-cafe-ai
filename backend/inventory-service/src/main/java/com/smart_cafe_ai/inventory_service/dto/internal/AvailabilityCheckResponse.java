package com.smart_cafe_ai.inventory_service.dto.internal;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AvailabilityCheckResponse {

    private boolean available;

    @JsonProperty("can_make")
    private boolean canMake;

    @JsonProperty("items")
    @Builder.Default
    private List<VariantAvailabilityResult> items = new ArrayList<>();

    @JsonProperty("insufficient_items")
    @Builder.Default
    private List<InsufficientItem> insufficientItems = new ArrayList<>();

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class VariantAvailabilityResult {
        @JsonProperty("variant_id")
        private Integer variantId;

        @JsonProperty("can_make")
        private boolean canMake;

        @JsonProperty("max_quantity")
        private Integer maxQuantity;

        @JsonProperty("missing_ingredients")
        @Builder.Default
        private List<MissingIngredient> missingIngredients = new ArrayList<>();
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class MissingIngredient {
        @JsonProperty("ingredient_id")
        private Integer ingredientId;

        @JsonProperty("ingredient_name")
        private String ingredientName;

        private BigDecimal required;

        private BigDecimal available;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class InsufficientItem {
        @JsonProperty("variant_id")
        private Integer variantId;

        @JsonProperty("ingredient_id")
        private Integer ingredientId;

        @JsonProperty("ingredient_name")
        private String ingredientName;

        private BigDecimal required;

        private BigDecimal available;
    }
}
