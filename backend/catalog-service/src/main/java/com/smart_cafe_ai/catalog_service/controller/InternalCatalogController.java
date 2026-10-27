package com.smart_cafe_ai.catalog_service.controller;
import com.smart_cafe_ai.catalog_service.dto.ApiResponse;
import com.smart_cafe_ai.catalog_service.dto.config.*;
import com.smart_cafe_ai.catalog_service.security.InternalOnly;
import com.smart_cafe_ai.catalog_service.service.CatalogResolveService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping({"/internal/catalog","/api/v1/internal/catalog"}) @InternalOnly @RequiredArgsConstructor
public class InternalCatalogController {
    private final CatalogResolveService service;
    @PostMapping("/resolve") public ApiResponse<ResolveResponse> resolve(@RequestBody ResolveRequest body){return ApiResponse.success(service.resolve(body));}
}
