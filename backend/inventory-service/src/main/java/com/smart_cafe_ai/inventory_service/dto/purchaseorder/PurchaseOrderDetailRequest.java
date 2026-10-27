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
public class PurchaseOrderDetailRequest {

    @NotNull(message = "Ingredient ID không được để trống")
    private Integer ingredientId;

    private String purchaseUnit;

    @Builder.Default
    private BigDecimal conversionFactor = BigDecimal.ONE;

    @NotNull(message = "Số lượng không được để trống")
    @DecimalMin(value = "0.001", message = "Số lượng phải > 0")
    private BigDecimal quantity;

    @NotNull(message = "Đơn giá không được để trống")
    @DecimalMin(value = "0.0", message = "Đơn giá phải >= 0")
    private BigDecimal unitPrice;
}
