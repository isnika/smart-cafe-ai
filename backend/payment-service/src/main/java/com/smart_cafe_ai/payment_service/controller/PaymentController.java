package com.smart_cafe_ai.payment_service.controller;

import com.smart_cafe_ai.payment_service.dto.ApiResponse;
import com.smart_cafe_ai.payment_service.dto.PageMeta;
import com.smart_cafe_ai.payment_service.dto.payment.ConfirmCashRequest;
import com.smart_cafe_ai.payment_service.dto.payment.CreatePaymentRequest;
import com.smart_cafe_ai.payment_service.dto.payment.PaymentResponse;
import com.smart_cafe_ai.payment_service.security.SecurityUtils;
import com.smart_cafe_ai.payment_service.service.PaymentService;
import jakarta.servlet.http.HttpServletRequest;
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

import java.util.Map;

@Slf4j
@RestController
@RequestMapping({"/payments", "/api/v1/payments"})
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;

    @PostMapping
    public ResponseEntity<ApiResponse<PaymentResponse>> createPayment(
            @Valid @RequestBody CreatePaymentRequest request,
            HttpServletRequest servletRequest
    ) {
        String currentUserId = SecurityUtils.getCurrentUserId();
        String clientIp = servletRequest.getRemoteAddr();
        PaymentResponse response = paymentService.createPayment(request, currentUserId, clientIp);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<java.util.List<PaymentResponse>>> getMyPayments(
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "size", defaultValue = "20") int size
    ) {
        String currentUserId = SecurityUtils.getCurrentUserId();
        if (currentUserId == null) currentUserId = "GUEST_CUSTOMER";
        int pageIndex = Math.max(0, page - 1);
        Page<PaymentResponse> pageResult = paymentService.getMyPayments(
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
    public ResponseEntity<ApiResponse<PaymentResponse>> getPaymentById(@PathVariable("id") Long id) {
        PaymentResponse response = paymentService.getPaymentById(id);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PostMapping("/{id:\\d+}/confirm-cash")
    @PreAuthorize("hasAnyRole('STAFF', 'CASHIER', 'MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<PaymentResponse>> confirmCash(
            @PathVariable("id") Long id,
            @Valid @RequestBody(required = false) ConfirmCashRequest request
    ) {
        if (request == null) {
            request = new ConfirmCashRequest();
        }
        String cashierUserId = SecurityUtils.getCurrentUserId();
        PaymentResponse response = paymentService.confirmCash(id, request, cashierUserId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('STAFF', 'CASHIER', 'MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<java.util.List<PaymentResponse>>> getPayments(
            @RequestParam(value = "branch_id", required = false) Integer branchId,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "size", defaultValue = "20") int size
    ) {
        int pageIndex = Math.max(0, page - 1);
        Page<PaymentResponse> pageResult = paymentService.getPayments(
                branchId,
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

    // -------------------------------------------------------------
    // Gateways Webhooks & Callbacks (Public)
    // -------------------------------------------------------------

    @GetMapping("/vnpay/return")
    public ResponseEntity<ApiResponse<PaymentResponse>> vnpayReturn(@RequestParam Map<String, String> params) {
        PaymentResponse response = paymentService.processVnPayReturn(params);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/vnpay/ipn")
    public ResponseEntity<Map<String, String>> vnpayIpn(@RequestParam Map<String, String> params) {
        Map<String, String> result = paymentService.processVnPayIpn(params);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/momo/ipn")
    public ResponseEntity<Map<String, Object>> momoIpn(@RequestBody Map<String, Object> payload) {
        Map<String, Object> result = paymentService.processMomoIpn(payload);
        return ResponseEntity.ok(result);
    }
}
