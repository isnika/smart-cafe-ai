package com.smart_cafe_ai.inventory_service.controller;

import com.smart_cafe_ai.inventory_service.dto.ApiResponse;
import com.smart_cafe_ai.inventory_service.dto.internal.AvailabilityCheckRequest;
import com.smart_cafe_ai.inventory_service.dto.internal.AvailabilityCheckResponse;
import com.smart_cafe_ai.inventory_service.service.InventoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping({"/inventory/internal/inventory", "/inventory/internal", "/internal/inventory", "/internal"})
@RequiredArgsConstructor
public class InternalInventoryController {

    private final InventoryService inventoryService;

    /**
     * Internal endpoint - No authentication required.
     * Used by order-service to check if ordered items can be made from current stock.
     */
    @PostMapping("/availability")
    public ResponseEntity<ApiResponse<AvailabilityCheckResponse>> checkAvailability(
            @Valid @RequestBody AvailabilityCheckRequest request) {
        return ResponseEntity.ok(ApiResponse.success(inventoryService.checkAvailability(request)));
    }
}
