package com.smart_cafe_ai.store_service.controller;

import com.smart_cafe_ai.store_service.dto.ApiResponse;
import com.smart_cafe_ai.store_service.dto.timekeeping.TimekeepingAdjustmentRequest;
import com.smart_cafe_ai.store_service.dto.timekeeping.TimekeepingCheckInRequest;
import com.smart_cafe_ai.store_service.dto.timekeeping.TimekeepingCheckOutRequest;
import com.smart_cafe_ai.store_service.dto.timekeeping.TimekeepingResponse;
import com.smart_cafe_ai.store_service.service.TimekeepingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping({"/timekeeping", "/api/v1/timekeeping"})
@RequiredArgsConstructor
public class TimekeepingController {

    private final TimekeepingService timekeepingService;

    /**
     * POST /timekeeping/check-in
     * Check-in vào schedule của chính mình. (Staff)
     */
    @PostMapping("/check-in")
    public ResponseEntity<ApiResponse<TimekeepingResponse>> checkIn(
            @Valid @RequestBody TimekeepingCheckInRequest request,
            Authentication authentication
    ) {
        String userId = authentication != null ? authentication.getName() : null;
        TimekeepingResponse response = timekeepingService.checkIn(userId, request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * POST /timekeeping/check-out
     * Check-out khỏi schedule của mình. (Staff)
     */
    @PostMapping("/check-out")
    public ResponseEntity<ApiResponse<TimekeepingResponse>> checkOut(
            @Valid @RequestBody TimekeepingCheckOutRequest request,
            Authentication authentication
    ) {
        String userId = authentication != null ? authentication.getName() : null;
        TimekeepingResponse response = timekeepingService.checkOut(userId, request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * GET /timekeeping/me
     * Lịch sử chấm công của tôi. (Staff)
     */
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<List<TimekeepingResponse>>> getMyTimekeeping(
            Authentication authentication,
            @RequestParam(value = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(value = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        String userId = authentication != null ? authentication.getName() : null;
        List<TimekeepingResponse> records = timekeepingService.getMyTimekeeping(userId, from, to);
        return ResponseEntity.ok(ApiResponse.success(records));
    }

    /**
     * GET /timekeeping
     * Bảng chấm công toàn chi nhánh. (Manager, Admin)
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<TimekeepingResponse>>> getTimekeeping(
            @RequestParam(value = "branch_id", required = false) Integer branchId,
            @RequestParam(value = "staff_id", required = false) Long staffId,
            @RequestParam(value = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(value = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        List<TimekeepingResponse> records = timekeepingService.getTimekeeping(branchId, staffId, from, to);
        return ResponseEntity.ok(ApiResponse.success(records));
    }

    /**
     * PATCH /timekeeping/{id}
     * Quản lý điều chỉnh chấm công. (Manager)
     */
    @PatchMapping("/{id}")
    public ResponseEntity<ApiResponse<TimekeepingResponse>> adjustTimekeeping(
            @PathVariable Long id,
            @Valid @RequestBody TimekeepingAdjustmentRequest request,
            Authentication authentication
    ) {
        String managerUserId = authentication != null ? authentication.getName() : null;
        TimekeepingResponse response = timekeepingService.adjustTimekeeping(id, managerUserId, request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
