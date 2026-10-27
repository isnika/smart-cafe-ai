package com.smart_cafe_ai.inventory_service.dto.ingredient;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IngredientResponse {
    private Integer id;
    private String name;
    private String unit;
    private BigDecimal averageCost;
    private Boolean isActive;
}
