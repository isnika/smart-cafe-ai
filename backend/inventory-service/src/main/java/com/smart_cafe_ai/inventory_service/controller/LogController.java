package com.smart_cafe_ai.inventory_service.controller;

import com.smart_cafe_ai.inventory_service.dto.ApiResponse;
import com.smart_cafe_ai.inventory_service.dto.PageMeta;
import com.smart_cafe_ai.inventory_service.dto.inventory.InventoryLogResponse;
import com.smart_cafe_ai.inventory_service.enums.TransactionType;
import com.smart_cafe_ai.inventory_service.service.InventoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping({"/inventory/logs", "/logs"})
@RequiredArgsConstructor
public class LogController {

    private final InventoryService inventoryService;

    @GetMapping
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<List<InventoryLogResponse>>> getLogs(
            @RequestParam(name = "branch_id", required = false) Integer branchIdParam,
            @RequestParam(name = "branchId", required = false) Integer branchId,
            @RequestParam(name = "ingredient_id", required = false) Integer ingredientIdParam,
            @RequestParam(name = "ingredientId", required = false) Integer ingredientId,
            @RequestParam(name = "transaction_type", required = false) TransactionType transactionTypeParam,
            @RequestParam(name = "type", required = false) TransactionType type,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        Integer targetBranchId = branchIdParam != null ? branchIdParam : branchId;
        Integer targetIngredientId = ingredientIdParam != null ? ingredientIdParam : ingredientId;
        TransactionType targetType = transactionTypeParam != null ? transactionTypeParam : type;

        Pageable pageable = PageRequest.of(page, size);
        Page<InventoryLogResponse> result = inventoryService.getLogs(targetBranchId, targetIngredientId, targetType, pageable);

        return ResponseEntity.ok(ApiResponse.success(result.getContent(),
                PageMeta.builder()
                        .page(page)
                        .size(size)
                        .totalElements(result.getTotalElements())
                        .totalPages(result.getTotalPages())
                        .build()));
    }
}
