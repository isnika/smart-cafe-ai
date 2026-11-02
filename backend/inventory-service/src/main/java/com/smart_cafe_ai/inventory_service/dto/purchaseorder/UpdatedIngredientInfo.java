package com.smart_cafe_ai.inventory_service.dto.purchaseorder;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UpdatedIngredientInfo {
    private Integer ingredientId;
    private String name;
    private BigDecimal quantityAdded;
    private BigDecimal newStock;
    private BigDecimal newAverageCost;
}
