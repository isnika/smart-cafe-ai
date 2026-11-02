package com.smart_cafe_ai.payment_service.controller;

import com.smart_cafe_ai.payment_service.dto.ApiResponse;
import com.smart_cafe_ai.payment_service.dto.shift.*;
import com.smart_cafe_ai.payment_service.security.SecurityUtils;
import com.smart_cafe_ai.payment_service.service.CashierShiftService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping({"/cashier-shifts", "/api/v1/cashier-shifts"})
@RequiredArgsConstructor
public class CashierShiftController {

    private final CashierShiftService shiftService;

    @PostMapping("/open")
    @PreAuthorize("hasAnyRole('STAFF', 'CASHIER', 'MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<CashierShiftResponse>> openShift(@Valid @RequestBody OpenShiftRequest request) {
        String staffUserId = SecurityUtils.getCurrentUserId();
        CashierShiftResponse response = shiftService.openShift(request, staffUserId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @GetMapping("/current")
    @PreAuthorize("hasAnyRole('STAFF', 'CASHIER', 'MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<CashierShiftResponse>> getCurrentShift() {
        String staffUserId = SecurityUtils.getCurrentUserId();
        CashierShiftResponse response = shiftService.getCurrentShift(staffUserId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/{id:\\d+}")
    @PreAuthorize("hasAnyRole('STAFF', 'CASHIER', 'MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<CashierShiftResponse>> getShiftById(@PathVariable("id") Integer id) {
        CashierShiftResponse response = shiftService.getShiftById(id);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PostMapping("/{id:\\d+}/close")
    @PreAuthorize("hasAnyRole('STAFF', 'CASHIER', 'MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<CashierShiftResponse>> closeShift(
            @PathVariable("id") Integer id,
            @Valid @RequestBody CloseShiftRequest request
    ) {
        String staffUserId = SecurityUtils.getCurrentUserId();
        CashierShiftResponse response = shiftService.closeShift(id, request, staffUserId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PostMapping("/{id:\\d+}/movements")
    @PreAuthorize("hasAnyRole('STAFF', 'CASHIER', 'MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<CashMovementResponse>> recordCashMovement(
            @PathVariable("id") Integer id,
            @Valid @RequestBody CashMovementRequest request
    ) {
        String staffUserId = SecurityUtils.getCurrentUserId();
        CashMovementResponse response = shiftService.recordCashMovement(id, request, staffUserId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @GetMapping("/{id:\\d+}/movements")
    @PreAuthorize("hasAnyRole('STAFF', 'CASHIER', 'MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<List<CashMovementResponse>>> getCashMovements(@PathVariable("id") Integer id) {
        List<CashMovementResponse> list = shiftService.getCashMovements(id);
        return ResponseEntity.ok(ApiResponse.success(list));
    }
}
