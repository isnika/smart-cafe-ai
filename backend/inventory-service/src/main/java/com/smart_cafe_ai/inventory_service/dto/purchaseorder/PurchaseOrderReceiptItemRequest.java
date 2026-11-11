package com.smart_cafe_ai.inventory_service.dto.purchaseorder;

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
public class PurchaseOrderReceiptItemRequest {

    @NotNull(message = "Ingredient ID không được để trống")
    private Integer ingredientId;

    @NotNull(message = "Số lượng thực nhận không được để trống")
    @DecimalMin(value = "0.001", message = "Số lượng thực nhận phải > 0")
    private BigDecimal receivedQuantity;
}
