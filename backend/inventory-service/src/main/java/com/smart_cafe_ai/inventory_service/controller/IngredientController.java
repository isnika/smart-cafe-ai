package com.smart_cafe_ai.inventory_service.controller;

import com.smart_cafe_ai.inventory_service.dto.ApiResponse;
import com.smart_cafe_ai.inventory_service.dto.PageMeta;
import com.smart_cafe_ai.inventory_service.dto.ingredient.IngredientRequest;
import com.smart_cafe_ai.inventory_service.dto.ingredient.IngredientResponse;
import com.smart_cafe_ai.inventory_service.service.IngredientService;
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
import java.util.Map;

@RestController
@RequestMapping({"/inventory/ingredients", "/ingredients"})
@RequiredArgsConstructor
public class IngredientController {

    private final IngredientService ingredientService;

    @GetMapping
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<List<IngredientResponse>>> getIngredients(
            @RequestParam(required = false) String q,
            @RequestParam(name = "is_active", required = false) Boolean isActive,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        Pageable pageable = PageRequest.of(page, size);
        Page<IngredientResponse> result = ingredientService.getIngredients(q, isActive, pageable);

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
    public ResponseEntity<ApiResponse<IngredientResponse>> getIngredient(@PathVariable Integer id) {
        return ResponseEntity.ok(ApiResponse.success(ingredientService.getIngredientById(id)));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<IngredientResponse>> createIngredient(
            @Valid @RequestBody IngredientRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(ingredientService.createIngredient(request)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<IngredientResponse>> updateIngredient(
            @PathVariable Integer id,
            @Valid @RequestBody IngredientRequest request) {
        return ResponseEntity.ok(ApiResponse.success(ingredientService.updateIngredient(id, request)));
    }

    @PatchMapping("/{id}/active")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<IngredientResponse>> updateActiveStatus(
            @PathVariable Integer id,
            @RequestParam(name = "is_active", required = false) Boolean isActiveParam,
            @RequestBody(required = false) Map<String, Object> body) {
        Boolean isActive = isActiveParam;
        if (isActive == null && body != null) {
            Object val = body.get("is_active");
            if (val == null) val = body.get("isActive");
            if (val != null) isActive = Boolean.valueOf(val.toString());
        }
        if (isActive == null) isActive = true;
        return ResponseEntity.ok(ApiResponse.success(ingredientService.updateActiveStatus(id, isActive)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deleteIngredient(@PathVariable Integer id) {
        ingredientService.deleteIngredient(id);
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}
