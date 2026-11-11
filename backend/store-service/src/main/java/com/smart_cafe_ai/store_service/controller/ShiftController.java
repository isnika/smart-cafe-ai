package com.smart_cafe_ai.store_service.controller;

import com.smart_cafe_ai.store_service.dto.ApiResponse;
import com.smart_cafe_ai.store_service.dto.shift.ShiftRequest;
import com.smart_cafe_ai.store_service.dto.shift.ShiftResponse;
import com.smart_cafe_ai.store_service.service.ShiftService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping({"/shifts", "/api/v1/shifts"})
@RequiredArgsConstructor
public class ShiftController {

    private final ShiftService shiftService;

    /**
     * GET /shifts
     * Danh sách định nghĩa ca của chi nhánh. (Staff, Manager, Admin)
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('STAFF', 'MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<List<ShiftResponse>>> getShifts(
            @RequestParam(value = "branch_id", required = false) Integer branchId,
            @RequestParam(value = "is_active", required = false) Boolean isActive
    ) {
        List<ShiftResponse> shifts = shiftService.getShifts(branchId, isActive);
        return ResponseEntity.ok(ApiResponse.success(shifts));
    }

    /**
     * GET /shifts/{id}
     * Chi tiết ca làm việc. (Staff, Manager, Admin)
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('STAFF', 'MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<ShiftResponse>> getShiftById(@PathVariable Integer id) {
        ShiftResponse shift = shiftService.getShiftById(id);
        return ResponseEntity.ok(ApiResponse.success(shift));
    }

    /**
     * POST /shifts
     * Tạo ca. (Manager, Admin)
     */
    @PostMapping
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<ShiftResponse>> createShift(@Valid @RequestBody ShiftRequest request) {
        ShiftResponse created = shiftService.createShift(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(created));
    }

    /**
     * PUT /shifts/{id}
     * Sửa ca. (Manager, Admin)
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<ShiftResponse>> updateShift(
            @PathVariable Integer id,
            @Valid @RequestBody ShiftRequest request
    ) {
        ShiftResponse updated = shiftService.updateShift(id, request);
        return ResponseEntity.ok(ApiResponse.success(updated));
    }

    /**
     * PATCH /shifts/{id}/active
     * Bật/tắt ca làm việc. (Manager, Admin)
     */
    @PatchMapping("/{id}/active")
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateShiftActive(
            @PathVariable Integer id,
            @RequestBody Map<String, Boolean> body
    ) {
        Boolean isActive = body.get("is_active");
        ShiftResponse updated = shiftService.updateShiftActive(id, isActive != null ? isActive : true);
        return ResponseEntity.ok(ApiResponse.success(Map.of("id", updated.getId(), "is_active", updated.getIsActive())));
    }
}
