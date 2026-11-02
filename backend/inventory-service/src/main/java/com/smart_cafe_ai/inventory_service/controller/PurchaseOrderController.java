package com.smart_cafe_ai.inventory_service.controller;

import com.smart_cafe_ai.inventory_service.dto.ApiResponse;
import com.smart_cafe_ai.inventory_service.dto.PageMeta;
import com.smart_cafe_ai.inventory_service.dto.purchaseorder.*;
import com.smart_cafe_ai.inventory_service.enums.PurchaseOrderStatus;
import com.smart_cafe_ai.inventory_service.service.PurchaseOrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping({"/inventory/purchase-orders", "/purchase-orders"})
@RequiredArgsConstructor
public class PurchaseOrderController {

    private final PurchaseOrderService purchaseOrderService;

    @GetMapping
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<List<PurchaseOrderResponse>>> getPurchaseOrders(
            @RequestParam(name = "branch_id", required = false) Integer branchIdParam,
            @RequestParam(name = "branchId", required = false) Integer branchId,
            @RequestParam(name = "supplier_id", required = false) Integer supplierIdParam,
            @RequestParam(name = "supplierId", required = false) Integer supplierId,
            @RequestParam(required = false) PurchaseOrderStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        Integer targetBranchId = branchIdParam != null ? branchIdParam : branchId;
        Integer targetSupplierId = supplierIdParam != null ? supplierIdParam : supplierId;

        Pageable pageable = PageRequest.of(page, size);
        Page<PurchaseOrderResponse> result;
        if (targetSupplierId != null || from != null || to != null) {
            result = purchaseOrderService.getPurchaseOrders(targetBranchId, targetSupplierId, status, from, to, pageable);
        } else {
            result = purchaseOrderService.getPurchaseOrders(targetBranchId, status, pageable);
        }

        return ResponseEntity.ok(ApiResponse.success(result.getContent(),
                PageMeta.builder()
                        .page(page)
                        .size(size)
                        .totalElements(result.getTotalElements())
                        .totalPages(result.getTotalPages())
                        .build()));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<PurchaseOrderResponse>> getPurchaseOrder(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(purchaseOrderService.getPurchaseOrderById(id)));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<PurchaseOrderResponse>> createPurchaseOrder(
            @Valid @RequestBody PurchaseOrderRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(purchaseOrderService.createPurchaseOrder(request)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<PurchaseOrderResponse>> updatePurchaseOrder(
            @PathVariable Long id,
            @Valid @RequestBody PurchaseOrderRequest request) {
        return ResponseEntity.ok(ApiResponse.success(purchaseOrderService.updatePurchaseOrder(id, request)));
    }

    @PostMapping("/{id}/order")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<PurchaseOrderResponse>> orderPurchaseOrder(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        LocalDateTime expectedAt = null;
        if (body != null && body.get("expected_at") != null) {
            expectedAt = LocalDateTime.parse(body.get("expected_at").toString());
        }
        return ResponseEntity.ok(ApiResponse.success(purchaseOrderService.orderPurchaseOrder(id, expectedAt)));
    }

    @PostMapping("/{id}/receipts")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<PurchaseOrderCompleteResponse>> receiveReceipts(
            @PathVariable Long id,
            @Valid @RequestBody PurchaseOrderReceiptRequest request) {
        return ResponseEntity.ok(ApiResponse.success(purchaseOrderService.receiveReceipts(id, request)));
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<Void>> cancelPurchaseOrderPost(@PathVariable Long id) {
        purchaseOrderService.cancelPurchaseOrder(id);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<Void>> cancelPurchaseOrder(@PathVariable Long id) {
        purchaseOrderService.cancelPurchaseOrder(id);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PostMapping("/{id}/complete")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<PurchaseOrderCompleteResponse>> completePurchaseOrder(
            @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(purchaseOrderService.completePurchaseOrder(id)));
    }
}
