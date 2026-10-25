package com.smart_cafe_ai.catalog_service.controller;

import com.smart_cafe_ai.catalog_service.dto.*;
import com.smart_cafe_ai.catalog_service.dto.CatalogResponse.*;
import com.smart_cafe_ai.catalog_service.dto.category.*;
import com.smart_cafe_ai.catalog_service.model.MenuStatus;
import com.smart_cafe_ai.catalog_service.security.*;
import com.smart_cafe_ai.catalog_service.service.CategoryAdminService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import java.util.List;

@RestController
@RequestMapping({"/catalog", "/api/v1/catalog"})
@ManagerOnly
@RequiredArgsConstructor
public class CategoryAdminController {
    private final CategoryAdminService service;

    @GetMapping("/admin/categories")
    public ApiResponse<List<CategoryAdminResponse>> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) MenuStatus status,
            @RequestParam(defaultValue = "sort_order,asc") String sort,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.list(new CategoryFilter(q, status, sort, page, size));
    }

    @PostMapping("/categories")
    public ResponseEntity<ApiResponse<CategoryResponse>> create(@RequestBody CategoryRequest request,
            @RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {
        var category = service.create(request, actor);
        return ResponseEntity.created(ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}").buildAndExpand(category.data().id()).toUri()).body(category);
    }

    @PutMapping("/categories/{id}")
    public ApiResponse<CategoryResponse> update(@PathVariable @Positive Integer id,
            @RequestBody CategoryRequest request,
            @RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {
        return service.update(id, request, actor);
    }

    @PatchMapping("/categories/{id}/status")
    public ApiResponse<CategoryStatusResponse> status(@PathVariable @Positive Integer id,
            @Valid @RequestBody CategoryStatusRequest request,
            @RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {
        return service.status(id, request.status(), actor);
    }

    @DeleteMapping("/categories/{id}")
    public ApiResponse<CategoryDeletedResponse> delete(@PathVariable @Positive Integer id,
            @RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {
        return service.delete(id, actor);
    }
}

