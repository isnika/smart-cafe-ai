package com.smart_cafe_ai.inventory_service.dto.recipe;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecipeItemResponse {
    @JsonProperty("id")
    private Long id;

    @JsonProperty("recipe_id")
    private Long recipeId;

    private Integer ingredientId;
    private String ingredientName;
    private String unit;
    private BigDecimal quantityRequired;
    private BigDecimal averageCost;
    private BigDecimal lineCost;
}
