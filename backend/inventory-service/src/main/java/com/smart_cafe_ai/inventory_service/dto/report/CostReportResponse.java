package com.smart_cafe_ai.inventory_service.dto.report;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CostReportResponse {
    private Integer branchId;
    private LocalDate from;
    private LocalDate to;
    private BigDecimal totalImportCost;
    private BigDecimal purchaseCost;
    private BigDecimal wasteCost;
    private BigDecimal cogs;
    private List<CostReportItem> items;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class CostReportItem {
        private Integer ingredientId;
        private String ingredientName;
        private String unit;
        private BigDecimal totalQuantityImported;
        private BigDecimal totalCost;
        private BigDecimal averageCost;
    }
}
