package com.smart_cafe_ai.inventory_service.controller;

import com.smart_cafe_ai.inventory_service.dto.ApiResponse;
import com.smart_cafe_ai.inventory_service.dto.PageMeta;
import com.smart_cafe_ai.inventory_service.dto.supplier.SupplierRequest;
import com.smart_cafe_ai.inventory_service.dto.supplier.SupplierResponse;
import com.smart_cafe_ai.inventory_service.enums.SupplierStatus;
import com.smart_cafe_ai.inventory_service.service.SupplierService;
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
@RequestMapping({"/inventory/suppliers", "/suppliers"})
@RequiredArgsConstructor
public class SupplierController {

    private final SupplierService supplierService;

    @GetMapping
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<List<SupplierResponse>>> getSuppliers(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) SupplierStatus status,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {

        if (page != null && size != null) {
            Pageable pageable = PageRequest.of(page, size);
            Page<SupplierResponse> pageResult = supplierService.getSuppliers(q, status, pageable);
            return ResponseEntity.ok(ApiResponse.success(pageResult.getContent(),
                    PageMeta.builder()
                            .page(page)
                            .size(size)
                            .totalElements(pageResult.getTotalElements())
                            .totalPages(pageResult.getTotalPages())
                            .build()));
        }

        return ResponseEntity.ok(ApiResponse.success(supplierService.getSuppliers(q)));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<SupplierResponse>> getSupplier(@PathVariable Integer id) {
        return ResponseEntity.ok(ApiResponse.success(supplierService.getSupplierById(id)));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<SupplierResponse>> createSupplier(
            @Valid @RequestBody SupplierRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(supplierService.createSupplier(request)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<SupplierResponse>> updateSupplier(
            @PathVariable Integer id,
            @Valid @RequestBody SupplierRequest request) {
        return ResponseEntity.ok(ApiResponse.success(supplierService.updateSupplier(id, request)));
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<SupplierResponse>> updateSupplierStatus(
            @PathVariable Integer id,
            @RequestParam(required = false) SupplierStatus status,
            @RequestBody(required = false) Map<String, Object> body) {
        SupplierStatus newStatus = status;
        if (newStatus == null && body != null && body.get("status") != null) {
            newStatus = SupplierStatus.valueOf(body.get("status").toString());
        }
        if (newStatus == null) newStatus = SupplierStatus.Active;
        return ResponseEntity.ok(ApiResponse.success(supplierService.updateSupplierStatus(id, newStatus)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deleteSupplier(@PathVariable Integer id) {
        supplierService.deleteSupplier(id);
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}
