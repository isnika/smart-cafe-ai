package com.smart_cafe_ai.catalog_service.controller;

import com.smart_cafe_ai.catalog_service.dto.ApiResponse;
import com.smart_cafe_ai.catalog_service.dto.product.*;
import com.smart_cafe_ai.catalog_service.model.MenuStatus;
import com.smart_cafe_ai.catalog_service.security.*;
import com.smart_cafe_ai.catalog_service.service.ProductAdminService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.util.List;
import java.util.Map;

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

    @RequestMapping(value = "/products/{id}/image", method = {RequestMethod.POST, RequestMethod.PUT}, consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<ProductAdminResponse> uploadProductImage(
            @PathVariable @Positive Integer id,
            @RequestParam(value = "file", required = false) MultipartFile file,
            @RequestParam(value = "image", required = false) MultipartFile imageFile,
            @RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {
        MultipartFile upload = file != null ? file : imageFile;
        return service.uploadProductImage(id, upload, actor);
    }

    @DeleteMapping("/products/{id}/image")
    public ApiResponse<ProductAdminResponse> deleteProductImage(
            @PathVariable @Positive Integer id,
            @RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {
        return service.deleteProductImage(id, actor);
    }

    @PostMapping(value = "/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<Map<String, String>> uploadStandaloneImage(
            @RequestParam(value = "file", required = false) MultipartFile file,
            @RequestParam(value = "image", required = false) MultipartFile imageFile) {
        MultipartFile upload = file != null ? file : imageFile;
        return service.uploadStandaloneImage(upload);
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
