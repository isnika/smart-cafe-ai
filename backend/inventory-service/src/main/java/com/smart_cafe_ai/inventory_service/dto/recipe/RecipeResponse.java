package com.smart_cafe_ai.inventory_service.dto.recipe;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecipeResponse {
    private Integer variantId;
    private List<RecipeItemResponse> items;
    private BigDecimal costPrice;
}
