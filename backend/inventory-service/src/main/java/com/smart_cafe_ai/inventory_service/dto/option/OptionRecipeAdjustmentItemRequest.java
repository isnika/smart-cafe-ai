package com.smart_cafe_ai.inventory_service.dto.option;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OptionRecipeAdjustmentItemRequest {

    @NotNull(message = "Ingredient ID không được để trống")
    private Integer ingredientId;

    @NotNull(message = "Số lượng thay đổi không được để trống")
    private BigDecimal quantityDelta;
}
