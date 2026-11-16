package com.smart_cafe_ai.inventory_service.dto.inventory;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StockResponse {
    private Long id;
    private Integer branchId;
    private Integer ingredientId;
    private String ingredientName;
    private String unit;
    private BigDecimal quantityInStock;
    private BigDecimal reservedQuantity;
    private BigDecimal availableQuantity;
    private BigDecimal reorderLevel;
    private BigDecimal averageCost;
    private Long version;
    private java.time.LocalDateTime updatedAt;
}
