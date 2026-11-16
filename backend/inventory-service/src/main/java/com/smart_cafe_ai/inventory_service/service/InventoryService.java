package com.smart_cafe_ai.inventory_service.service;

import com.smart_cafe_ai.inventory_service.dto.internal.AvailabilityCheckRequest;
import com.smart_cafe_ai.inventory_service.dto.internal.AvailabilityCheckResponse;
import com.smart_cafe_ai.inventory_service.dto.inventory.InventoryLogResponse;
import com.smart_cafe_ai.inventory_service.dto.inventory.StockAdjustmentRequest;
import com.smart_cafe_ai.inventory_service.dto.inventory.StockResponse;
import com.smart_cafe_ai.inventory_service.enums.TransactionType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;

public interface InventoryService {
    List<StockResponse> getStocks(Integer branchId, Integer ingredientId);
    StockResponse adjustStock(StockAdjustmentRequest request);
    Page<InventoryLogResponse> getLogs(Integer branchId, Integer ingredientId, TransactionType type, Pageable pageable);
    AvailabilityCheckResponse checkAvailability(AvailabilityCheckRequest request);
    void processOrderConfirmed(String eventId, Long orderId, Integer branchId, List<com.smart_cafe_ai.inventory_service.dto.event.OrderItemEvent> items);
    void processOrderCancelled(String eventId, Long orderId, Integer branchId, List<com.smart_cafe_ai.inventory_service.dto.event.OrderItemEvent> items);
}
