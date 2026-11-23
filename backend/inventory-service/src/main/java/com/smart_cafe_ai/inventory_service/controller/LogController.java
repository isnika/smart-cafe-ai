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

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping({"/api/v1/inventory/logs", "/inventory/logs", "/logs"})
@RequiredArgsConstructor
public class LogController {

    private final InventoryService inventoryService;

    @GetMapping
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<Object>> getLogs(
            @RequestParam(name = "branch_id", required = false) Integer branchIdParam,
            @RequestParam(name = "branchId", required = false) Integer branchId,
            @RequestParam(name = "ingredient_id", required = false) Integer ingredientIdParam,
            @RequestParam(name = "ingredientId", required = false) Integer ingredientId,
            @RequestParam(name = "transaction_type", required = false) TransactionType transactionTypeParam,
            @RequestParam(name = "type", required = false) TransactionType type,
            @RequestParam(name = "page", defaultValue = "1") int pageParam,
            @RequestParam(name = "pageSize", required = false) Integer pageSize,
            @RequestParam(name = "size", defaultValue = "20") int sizeParam) {

        Integer targetBranchId = branchIdParam != null ? branchIdParam : branchId;
        Integer targetIngredientId = ingredientIdParam != null ? ingredientIdParam : ingredientId;
        TransactionType targetType = transactionTypeParam != null ? transactionTypeParam : type;

        int pageIndex = pageParam > 0 ? pageParam - 1 : 0;
        int size = (pageSize != null && pageSize > 0) ? pageSize : (sizeParam > 0 ? sizeParam : 20);

        Pageable pageable = PageRequest.of(pageIndex, size);
        Page<InventoryLogResponse> result = inventoryService.getLogs(targetBranchId, targetIngredientId, targetType, pageable);

        Map<String, Object> pageData = new HashMap<>();
        pageData.put("items", result.getContent());
        pageData.put("total", result.getTotalElements());
        pageData.put("page", pageParam > 0 ? pageParam : 1);
        pageData.put("pageSize", size);

        return ResponseEntity.ok(ApiResponse.success(pageData,
                PageMeta.builder()
                        .page(pageParam > 0 ? pageParam : 1)
                        .size(size)
                        .totalElements(result.getTotalElements())
                        .totalPages(result.getTotalPages())
                        .build()));
    }
}
