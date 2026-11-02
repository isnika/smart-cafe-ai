package com.smart_cafe_ai.inventory_service.service;

import com.smart_cafe_ai.inventory_service.dto.report.CostReportResponse;
import com.smart_cafe_ai.inventory_service.dto.report.IngredientUsageReportResponse;

import java.time.LocalDate;
import java.util.List;

public interface ReportService {
    CostReportResponse getCostReport(Integer branchId, LocalDate from, LocalDate to);
    List<IngredientUsageReportResponse> getUsageReport(Integer branchId, LocalDate from, LocalDate to);
}
