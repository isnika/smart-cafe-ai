package com.smart_cafe_ai.inventory_service.service;

import com.smart_cafe_ai.inventory_service.dto.supplier.SupplierRequest;
import com.smart_cafe_ai.inventory_service.dto.supplier.SupplierResponse;
import com.smart_cafe_ai.inventory_service.enums.SupplierStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;

public interface SupplierService {
    List<SupplierResponse> getSuppliers(String q);
    Page<SupplierResponse> getSuppliers(String q, SupplierStatus status, Pageable pageable);
    SupplierResponse getSupplierById(Integer id);
    SupplierResponse createSupplier(SupplierRequest request);
    SupplierResponse updateSupplier(Integer id, SupplierRequest request);
    SupplierResponse updateSupplierStatus(Integer id, SupplierStatus status);
    void deleteSupplier(Integer id);
}
