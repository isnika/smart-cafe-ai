package com.smart_cafe_ai.payment_service.controller;

import com.smart_cafe_ai.payment_service.dto.ApiResponse;
import com.smart_cafe_ai.payment_service.dto.PageMeta;
import com.smart_cafe_ai.payment_service.dto.refund.CreateRefundRequest;
import com.smart_cafe_ai.payment_service.dto.refund.ProcessRefundRequest;
import com.smart_cafe_ai.payment_service.dto.refund.RefundResponse;
import com.smart_cafe_ai.payment_service.enums.RefundStatus;
import com.smart_cafe_ai.payment_service.security.SecurityUtils;
import com.smart_cafe_ai.payment_service.service.RefundService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping({"/refunds", "/api/v1/refunds"})
@RequiredArgsConstructor
public class RefundController {

    private final RefundService refundService;

    @PostMapping
    public ResponseEntity<ApiResponse<RefundResponse>> createRefund(@Valid @RequestBody CreateRefundRequest request) {
        String currentUserId = SecurityUtils.getCurrentUserId();
        if (currentUserId == null) currentUserId = "GUEST_CUSTOMER";
        RefundResponse response = refundService.createRefund(request, currentUserId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<List<RefundResponse>>> getMyRefunds(
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "size", defaultValue = "20") int size
    ) {
        String currentUserId = SecurityUtils.getCurrentUserId();
        if (currentUserId == null) currentUserId = "GUEST_CUSTOMER";
        int pageIndex = Math.max(0, page - 1);
        Page<RefundResponse> pageResult = refundService.getMyRefunds(
                currentUserId,
                PageRequest.of(pageIndex, size, Sort.by(Sort.Direction.DESC, "createdAt"))
        );

        PageMeta meta = PageMeta.builder()
                .page(page)
                .size(size)
                .totalItems(pageResult.getTotalElements())
                .totalPages(pageResult.getTotalPages())
                .build();

        return ResponseEntity.ok(ApiResponse.success(pageResult.getContent(), meta));
    }

    @GetMapping("/{id:\\d+}")
    public ResponseEntity<ApiResponse<RefundResponse>> getRefundById(@PathVariable("id") Long id) {
        RefundResponse response = refundService.getRefundById(id);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PostMapping("/{id}/process")
    @PreAuthorize("hasAnyRole('STAFF', 'CASHIER', 'MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<RefundResponse>> processRefund(
            @PathVariable("id") Long id,
            @Valid @RequestBody ProcessRefundRequest request
    ) {
        String staffUserId = SecurityUtils.getCurrentUserId();
        RefundResponse response = refundService.processRefund(id, request, staffUserId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('STAFF', 'CASHIER', 'MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<List<RefundResponse>>> getRefunds(
            @RequestParam(value = "status", required = false) RefundStatus status,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "size", defaultValue = "20") int size
    ) {
        int pageIndex = Math.max(0, page - 1);
        Page<RefundResponse> pageResult = refundService.getRefunds(
                status,
                PageRequest.of(pageIndex, size, Sort.by(Sort.Direction.DESC, "createdAt"))
        );

        PageMeta meta = PageMeta.builder()
                .page(page)
                .size(size)
                .totalItems(pageResult.getTotalElements())
                .totalPages(pageResult.getTotalPages())
                .build();

        return ResponseEntity.ok(ApiResponse.success(pageResult.getContent(), meta));
    }
}
