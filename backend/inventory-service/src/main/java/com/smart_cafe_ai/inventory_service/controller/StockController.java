package com.smart_cafe_ai.inventory_service.controller;

import com.smart_cafe_ai.inventory_service.dto.ApiResponse;
import com.smart_cafe_ai.inventory_service.dto.inventory.StockAdjustmentRequest;
import com.smart_cafe_ai.inventory_service.dto.inventory.StockResponse;
import com.smart_cafe_ai.inventory_service.service.InventoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping({"/inventory/stocks", "/stocks"})
@RequiredArgsConstructor
public class StockController {

    private final InventoryService inventoryService;

    @GetMapping
    @PreAuthorize("hasAnyRole('STAFF','MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<List<StockResponse>>> getStocks(
            @RequestParam(name = "branch_id", required = false) Integer branchIdParam,
            @RequestParam(name = "branchId", required = false) Integer branchId,
            @RequestParam(name = "ingredient_id", required = false) Integer ingredientIdParam,
            @RequestParam(name = "ingredientId", required = false) Integer ingredientId) {
        Integer targetBranchId = branchIdParam != null ? branchIdParam : branchId;
        Integer targetIngredientId = ingredientIdParam != null ? ingredientIdParam : ingredientId;
        return ResponseEntity.ok(ApiResponse.success(inventoryService.getStocks(targetBranchId, targetIngredientId)));
    }

    @PostMapping("/adjustments")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<StockResponse>> adjustStock(
            @Valid @RequestBody StockAdjustmentRequest request) {
        return ResponseEntity.ok(ApiResponse.success(inventoryService.adjustStock(request)));
    }
}
