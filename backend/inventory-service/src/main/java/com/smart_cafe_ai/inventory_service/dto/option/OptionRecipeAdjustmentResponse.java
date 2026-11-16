package com.smart_cafe_ai.inventory_service.dto.option;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OptionRecipeAdjustmentResponse {
    private Long id;
    private Integer optionId;
    private Integer ingredientId;
    private String ingredientName;
    private BigDecimal quantityDelta;
}
