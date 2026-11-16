package com.smart_cafe_ai.inventory_service.controller;

import com.smart_cafe_ai.inventory_service.dto.ApiResponse;
import com.smart_cafe_ai.inventory_service.dto.option.OptionRecipeAdjustmentRequest;
import com.smart_cafe_ai.inventory_service.dto.option.OptionRecipeAdjustmentResponse;
import com.smart_cafe_ai.inventory_service.service.OptionRecipeAdjustmentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping({"/inventory/options", "/options"})
@RequiredArgsConstructor
public class OptionRecipeAdjustmentController {

    private final OptionRecipeAdjustmentService optionRecipeAdjustmentService;

    @GetMapping("/{optionId}/recipe-adjustments")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<List<OptionRecipeAdjustmentResponse>>> getRecipeAdjustments(
            @PathVariable Integer optionId) {
        return ResponseEntity.ok(ApiResponse.success(optionRecipeAdjustmentService.getAdjustmentsByOptionId(optionId)));
    }

    @PutMapping("/{optionId}/recipe-adjustments")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<List<OptionRecipeAdjustmentResponse>>> setRecipeAdjustments(
            @PathVariable Integer optionId,
            @Valid @RequestBody OptionRecipeAdjustmentRequest request) {
        return ResponseEntity.ok(ApiResponse.success(optionRecipeAdjustmentService.setAdjustmentsForOption(optionId, request)));
    }
}
