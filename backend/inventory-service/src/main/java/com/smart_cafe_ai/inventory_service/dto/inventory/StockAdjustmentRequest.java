package com.smart_cafe_ai.inventory_service.dto.inventory;

import com.smart_cafe_ai.inventory_service.enums.TransactionType;
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
public class StockAdjustmentRequest {

    @NotNull(message = "Branch ID không được để trống")
    private Integer branchId;

    @NotNull(message = "Ingredient ID không được để trống")
    private Integer ingredientId;

    @NotNull(message = "Loại giao dịch không được để trống")
    private TransactionType transactionType;

    @NotNull(message = "Số lượng thay đổi không được để trống")
    private BigDecimal quantityChanged;

    private String note;
    private String reason;
    private Long version;
}
