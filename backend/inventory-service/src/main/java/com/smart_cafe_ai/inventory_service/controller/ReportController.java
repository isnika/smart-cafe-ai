package com.smart_cafe_ai.inventory_service.controller;

import com.smart_cafe_ai.inventory_service.dto.ApiResponse;
import com.smart_cafe_ai.inventory_service.dto.report.CostReportResponse;
import com.smart_cafe_ai.inventory_service.dto.report.IngredientUsageReportResponse;
import com.smart_cafe_ai.inventory_service.service.ReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping({"/inventory/reports", "/reports"})
@RequiredArgsConstructor
public class ReportController {

    private final ReportService reportService;

    @GetMapping("/costs")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<CostReportResponse>> getCostReport(
            @RequestParam(name = "branch_id", required = false) Integer branchIdParam,
            @RequestParam(name = "branchId", required = false) Integer branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(name = "group_by", required = false) String groupBy) {
        Integer targetBranchId = branchIdParam != null ? branchIdParam : branchId;
        if (from == null) {
            from = LocalDate.now().minusMonths(1);
        }
        if (to == null) {
            to = LocalDate.now();
        }
        return ResponseEntity.ok(ApiResponse.success(reportService.getCostReport(targetBranchId, from, to)));
    }

    @GetMapping("/usage")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<List<IngredientUsageReportResponse>>> getUsageReport(
            @RequestParam(name = "branch_id", required = false) Integer branchIdParam,
            @RequestParam(name = "branchId", required = false) Integer branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        Integer targetBranchId = branchIdParam != null ? branchIdParam : branchId;
        if (from == null) {
            from = LocalDate.now().minusMonths(1);
        }
        if (to == null) {
            to = LocalDate.now();
        }
        return ResponseEntity.ok(ApiResponse.success(reportService.getUsageReport(targetBranchId, from, to)));
    }
}
