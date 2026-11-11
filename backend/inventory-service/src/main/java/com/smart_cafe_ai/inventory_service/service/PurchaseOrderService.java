package com.smart_cafe_ai.inventory_service.service;

import com.smart_cafe_ai.inventory_service.dto.purchaseorder.PurchaseOrderCompleteResponse;
import com.smart_cafe_ai.inventory_service.dto.purchaseorder.PurchaseOrderReceiptRequest;
import com.smart_cafe_ai.inventory_service.dto.purchaseorder.PurchaseOrderRequest;
import com.smart_cafe_ai.inventory_service.dto.purchaseorder.PurchaseOrderResponse;
import com.smart_cafe_ai.inventory_service.enums.PurchaseOrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;

public interface PurchaseOrderService {
    Page<PurchaseOrderResponse> getPurchaseOrders(Integer branchId, PurchaseOrderStatus status, Pageable pageable);
    Page<PurchaseOrderResponse> getPurchaseOrders(Integer branchId, Integer supplierId, PurchaseOrderStatus status, LocalDateTime from, LocalDateTime to, Pageable pageable);
    PurchaseOrderResponse getPurchaseOrderById(Long id);
    PurchaseOrderResponse createPurchaseOrder(PurchaseOrderRequest request);
    PurchaseOrderResponse updatePurchaseOrder(Long id, PurchaseOrderRequest request);
    PurchaseOrderResponse orderPurchaseOrder(Long id, LocalDateTime expectedAt);
    PurchaseOrderCompleteResponse receiveReceipts(Long id, PurchaseOrderReceiptRequest request);
    void cancelPurchaseOrder(Long id);
    PurchaseOrderCompleteResponse completePurchaseOrder(Long id);
}
