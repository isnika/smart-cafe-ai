package com.smart_cafe_ai.inventory_service.dto.report;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IngredientUsageReportResponse {
    private Integer ingredientId;
    private String ingredientName;
    private String unit;
    private BigDecimal autoDeductQuantity;
    private BigDecimal wasteQuantity;
    private BigDecimal refundQuantity;
    private BigDecimal netUsage;
}
