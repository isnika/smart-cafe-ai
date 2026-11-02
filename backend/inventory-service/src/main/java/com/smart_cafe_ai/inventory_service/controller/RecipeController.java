package com.smart_cafe_ai.inventory_service.controller;

import com.smart_cafe_ai.inventory_service.dto.ApiResponse;
import com.smart_cafe_ai.inventory_service.dto.PageMeta;
import com.smart_cafe_ai.inventory_service.dto.recipe.*;
import com.smart_cafe_ai.inventory_service.service.RecipeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping({"/inventory/recipes", "/recipes"})
@RequiredArgsConstructor
public class RecipeController {

    private final RecipeService recipeService;

    @GetMapping
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<List<RecipeSummaryResponse>>> getRecipes(
            @RequestParam(name = "branch_id", required = false) Integer branchId,
            @RequestParam(name = "variant_id", required = false) Integer variantId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        Pageable pageable = PageRequest.of(page, size);
        Page<RecipeSummaryResponse> result = recipeService.getRecipes(branchId, variantId, pageable);

        return ResponseEntity.ok(ApiResponse.success(result.getContent(),
                PageMeta.builder()
                        .page(page)
                        .size(size)
                        .totalElements(result.getTotalElements())
                        .totalPages(result.getTotalPages())
                        .build()));
    }

    @GetMapping("/variants/{variantId}")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<RecipeResponse>> getRecipe(
            @PathVariable Integer variantId,
            @RequestParam(name = "branch_id", required = false) Integer branchId) {
        return ResponseEntity.ok(ApiResponse.success(recipeService.getRecipeByVariantId(variantId, branchId)));
    }

    @PutMapping("/variants/{variantId}")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<RecipeResponse>> setRecipe(
            @PathVariable Integer variantId,
            @Valid @RequestBody RecipeRequest request) {
        return ResponseEntity.ok(ApiResponse.success(recipeService.setRecipeForVariant(variantId, request)));
    }

    @PostMapping("/variants/{variantId}/items")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<RecipeItemResponse>> addRecipeItem(
            @PathVariable Integer variantId,
            @Valid @RequestBody RecipeItemRequest item) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(recipeService.addRecipeItem(variantId, item)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<RecipeItemResponse>> updateRecipeItem(
            @PathVariable Long id,
            @Valid @RequestBody RecipeItemRequest item) {
        return ResponseEntity.ok(ApiResponse.success(recipeService.updateRecipeItem(id, item)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deleteRecipeItem(@PathVariable Long id) {
        recipeService.deleteRecipeItem(id);
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}
