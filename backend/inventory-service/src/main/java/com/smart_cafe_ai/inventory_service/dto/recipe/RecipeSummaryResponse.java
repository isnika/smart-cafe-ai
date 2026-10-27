package com.smart_cafe_ai.inventory_service.dto.recipe;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecipeSummaryResponse {
    private Integer variantId;
    private Integer ingredientCount;
    private BigDecimal costPrice;
}
