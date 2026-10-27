package com.smart_cafe_ai.catalog_service.controller;

import com.smart_cafe_ai.catalog_service.dto.ApiResponse;
import com.smart_cafe_ai.catalog_service.dto.product.*;
import com.smart_cafe_ai.catalog_service.model.MenuStatus;
import com.smart_cafe_ai.catalog_service.security.*;
import com.smart_cafe_ai.catalog_service.service.ProductAdminService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import java.util.List;

@RestController
@RequestMapping({"/catalog", "/api/v1/catalog"})
@ManagerOnly
@RequiredArgsConstructor
public class ProductAdminController {
    private final ProductAdminService service;

    @GetMapping("/admin/products")
    public ApiResponse<List<ProductAdminResponse>> list(@RequestParam(required = false) String q,
            @RequestParam(name = "category_id", required = false) Integer categoryId,
            @RequestParam(required = false) MenuStatus status,
            @RequestParam(defaultValue = "sort_order,asc") String sort,
            @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int size) {
        return service.list(new ProductAdminFilter(q, categoryId, status, sort, page, size));
    }

    @PostMapping("/products")
    public ResponseEntity<ApiResponse<ProductAdminResponse.Detail>> create(@RequestBody ProductCreateRequest request,
            @RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {
        var result = service.create(request, actor);
        return ResponseEntity.created(ServletUriComponentsBuilder.fromCurrentRequest().path("/{id}")
                .buildAndExpand(result.data().product().id()).toUri()).body(result);
    }

    @PutMapping("/products/{id}")
    public ApiResponse<ProductAdminResponse> update(@PathVariable @Positive Integer id, @RequestBody ProductRequest request,
            @RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {
        return service.update(id, request, actor);
    }

    @PatchMapping("/products/{id}/status")
    public ApiResponse<ProductAdminResponse.Status> status(@PathVariable @Positive Integer id,
            @Valid @RequestBody ProductStatusRequest request, @RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {
        return service.status(id, request.status(), actor);
    }

    @DeleteMapping("/products/{id}")
    public ApiResponse<ProductAdminResponse.Deleted> delete(@PathVariable @Positive Integer id,
            @RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {
        return service.delete(id, actor);
    }
}
