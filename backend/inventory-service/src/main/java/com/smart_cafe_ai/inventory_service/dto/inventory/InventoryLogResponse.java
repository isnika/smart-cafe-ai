package com.smart_cafe_ai.inventory_service.dto.inventory;

import com.smart_cafe_ai.inventory_service.enums.TransactionType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InventoryLogResponse {
    private Long id;
    private Integer branchId;
    private Integer ingredientId;
    private String ingredientName;
    private TransactionType transactionType;
    private BigDecimal quantityChanged;
    private String referenceType;
    private String referenceId;
    private LocalDateTime createdAt;
}
