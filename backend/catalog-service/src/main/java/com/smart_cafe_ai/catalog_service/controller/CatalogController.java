package com.smart_cafe_ai.catalog_service.controller;

import com.smart_cafe_ai.catalog_service.dto.*;
import com.smart_cafe_ai.catalog_service.dto.CatalogResponse.*;
import com.smart_cafe_ai.catalog_service.model.*;
import com.smart_cafe_ai.catalog_service.security.CatalogAccess;
import com.smart_cafe_ai.catalog_service.service.CatalogService;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping({"/catalog", "/api/v1/catalog"})
@RequiredArgsConstructor
public class CatalogController {
    private final CatalogService service;
    private final CatalogAccess access;

    @GetMapping("/categories")
    public ApiResponse<List<CategoryResponse>> categories(
            @RequestParam(defaultValue = "Active") MenuStatus status,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        if (status == MenuStatus.Inactive) access.requireManager(authorization);
        var data = service.categories(status);
        return ApiResponse.success(data, data.isEmpty() ? "Hiện chưa có danh mục phù hợp để hiển thị." : null);
    }

    @GetMapping("/products")
    public ApiResponse<List<ProductResponse>> products(
            @RequestParam(required = false) String q,
            @RequestParam(name = "category_id", required = false) Integer categoryId,
            @RequestParam(name = "branch_id", required = false) Integer branchId,
            @RequestParam(required = false) Temperature temperature,
            @RequestParam(name = "caffeine_level", required = false) CaffeineLevel caffeineLevel,
            @RequestParam(name = "flavor_tag", required = false) String flavorTag,
            @RequestParam(name = "min_price", required = false) BigDecimal minPrice,
            @RequestParam(name = "max_price", required = false) BigDecimal maxPrice,
            @RequestParam(defaultValue = "sort_order,asc") String sort,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.products(new ProductFilter(q, categoryId, branchId, temperature, caffeineLevel,
                flavorTag, minPrice, maxPrice, sort, page, size));
    }

    @GetMapping("/products/{id}")
    public ApiResponse<ProductDetail> product(@PathVariable @Positive Integer id,
            @RequestParam(name = "branch_id", required = false) @Positive Integer branchId) {
        return ApiResponse.success(service.product(id, branchId));
    }
}

