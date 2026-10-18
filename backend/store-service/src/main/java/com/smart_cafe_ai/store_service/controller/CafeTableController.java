package com.smart_cafe_ai.store_service.controller;

import com.smart_cafe_ai.store_service.dto.ApiResponse;
import com.smart_cafe_ai.store_service.dto.table.CafeTableRequest;
import com.smart_cafe_ai.store_service.dto.table.CafeTableResponse;
import com.smart_cafe_ai.store_service.service.CafeTableService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@RestController
@RequiredArgsConstructor
public class CafeTableController {

    private final CafeTableService cafeTableService;

    /**
     * GET /branches/{branchId}/tables
     * Danh sách bàn theo chi nhánh. (Staff/Manager/Admin)
     */
    @GetMapping({"/branches/{branchId}/tables", "/api/v1/branches/{branchId}/tables"})
    public ResponseEntity<ApiResponse<List<CafeTableResponse>>> getTablesByBranch(
            @PathVariable Integer branchId,
            @RequestParam(value = "is_active", required = false) Boolean isActive
    ) {
        List<CafeTableResponse> tables = cafeTableService.getTablesByBranch(branchId, isActive);
        return ResponseEntity.ok(ApiResponse.success(tables));
    }

    /**
     * POST /branches/{branchId}/tables
     * Tạo bàn và mã QR duy nhất. (Admin)
     */
    @PostMapping({"/branches/{branchId}/tables", "/api/v1/branches/{branchId}/tables"})
    public ResponseEntity<ApiResponse<CafeTableResponse>> createTable(
            @PathVariable Integer branchId,
            @Valid @RequestBody CafeTableRequest request
    ) {
        CafeTableResponse created = cafeTableService.createTable(branchId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(created));
    }

    /**
     * GET /tables/{id}
     * Chi tiết bàn.
     */
    @GetMapping({"/tables/{id}", "/api/v1/tables/{id}"})
    public ResponseEntity<ApiResponse<CafeTableResponse>> getTableById(@PathVariable Integer id) {
        CafeTableResponse table = cafeTableService.getTableById(id);
        return ResponseEntity.ok(ApiResponse.success(table));
    }

    /**
     * PUT /tables/{id}
     * Sửa số bàn và thông tin bàn. (Admin)
     */
    @PutMapping({"/tables/{id}", "/api/v1/tables/{id}"})
    public ResponseEntity<ApiResponse<CafeTableResponse>> updateTable(
            @PathVariable Integer id,
            @Valid @RequestBody CafeTableRequest request
    ) {
        CafeTableResponse updated = cafeTableService.updateTable(id, request);
        return ResponseEntity.ok(ApiResponse.success(updated));
    }

    /**
     * PATCH /tables/{id}/active
     * Bật/tắt bàn khỏi danh sách phục vụ. (Admin)
     */
    @PatchMapping({"/tables/{id}/active", "/api/v1/tables/{id}/active"})
    public ResponseEntity<ApiResponse<CafeTableResponse>> updateTableActive(
            @PathVariable Integer id,
            @RequestBody Map<String, Boolean> body
    ) {
        Boolean isActive = body.get("is_active");
        CafeTableResponse updated = cafeTableService.updateTableActive(id, isActive != null ? isActive : true);
        return ResponseEntity.ok(ApiResponse.success(updated));
    }

    /**
     * POST /tables/{id}/qr/regenerate
     * Sinh lại mã QR token cho bàn. (Admin)
     */
    @PostMapping({"/tables/{id}/qr/regenerate", "/api/v1/tables/{id}/qr/regenerate"})
    public ResponseEntity<ApiResponse<CafeTableResponse>> regenerateQrCode(@PathVariable Integer id) {
        CafeTableResponse updated = cafeTableService.regenerateQrCode(id);
        return ResponseEntity.ok(ApiResponse.success(updated));
    }

    /**
     * GET /tables/{id}/qr
     * Tải ảnh QR để in. (Manager, Admin)
     */
    @GetMapping(value = {"/tables/{id}/qr", "/api/v1/tables/{id}/qr"}, produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<byte[]> getTableQr(
            @PathVariable Integer id,
            @RequestParam(value = "format", defaultValue = "png") String format
    ) {
        byte[] image = cafeTableService.getTableQrImage(id, format);
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"table-" + id + "-qr.png\"")
                .body(image);
    }

    /**
     * GET /branches/{branchId}/tables/qr-export
     * Xuất PDF QR của toàn bộ bàn active trong chi nhánh. (Admin)
     */
    @GetMapping(value = {"/branches/{branchId}/tables/qr-export", "/api/v1/branches/{branchId}/tables/qr-export"}, produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> exportBranchTablesQrPdf(@PathVariable Integer branchId) {
        byte[] pdfBytes = cafeTableService.exportBranchTablesQrPdf(branchId);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"branch-" + branchId + "-tables-qr.pdf\"")
                .body(pdfBytes);
    }
}
