package com.smart_cafe_ai.inventory_service.service.impl;

import com.smart_cafe_ai.inventory_service.dto.supplier.SupplierRequest;
import com.smart_cafe_ai.inventory_service.dto.supplier.SupplierResponse;
import com.smart_cafe_ai.inventory_service.entity.Supplier;
import com.smart_cafe_ai.inventory_service.enums.SupplierStatus;
import com.smart_cafe_ai.inventory_service.exception.ResourceNotFoundException;
import com.smart_cafe_ai.inventory_service.repository.SupplierRepository;
import com.smart_cafe_ai.inventory_service.service.SupplierService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class SupplierServiceImpl implements SupplierService {

    private final SupplierRepository supplierRepository;

    @Override
    @Transactional(readOnly = true)
    public List<SupplierResponse> getSuppliers(String q) {
        List<Supplier> suppliers;
        if (StringUtils.hasText(q)) {
            suppliers = supplierRepository.findByNameContainingIgnoreCase(q);
        } else {
            suppliers = supplierRepository.findAll();
        }
        return suppliers.stream().map(this::toResponse).collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SupplierResponse> getSuppliers(String q, SupplierStatus status, Pageable pageable) {
        return supplierRepository.findByFilter(StringUtils.hasText(q) ? q : null, status, pageable)
                .map(this::toResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public SupplierResponse getSupplierById(Integer id) {
        return supplierRepository.findById(id)
                .map(this::toResponse)
                .orElseThrow(() -> new ResourceNotFoundException("Nhà cung cấp", id));
    }

    @Override
    @Transactional
    public SupplierResponse createSupplier(SupplierRequest request) {
        Supplier supplier = Supplier.builder()
                .name(request.getName())
                .phone(request.getPhone())
                .email(request.getEmail())
                .taxCode(request.getTaxCode())
                .address(request.getAddress())
                .status(request.getStatus() != null ? request.getStatus() : SupplierStatus.Active)
                .build();
        return toResponse(supplierRepository.save(supplier));
    }

    @Override
    @Transactional
    public SupplierResponse updateSupplier(Integer id, SupplierRequest request) {
        Supplier supplier = supplierRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Nhà cung cấp", id));
        supplier.setName(request.getName());
        supplier.setPhone(request.getPhone());
        if (request.getEmail() != null) {
            supplier.setEmail(request.getEmail());
        }
        if (request.getTaxCode() != null) {
            supplier.setTaxCode(request.getTaxCode());
        }
        supplier.setAddress(request.getAddress());
        if (request.getStatus() != null) {
            supplier.setStatus(request.getStatus());
        }
        return toResponse(supplierRepository.save(supplier));
    }

    @Override
    @Transactional
    public SupplierResponse updateSupplierStatus(Integer id, SupplierStatus status) {
        Supplier supplier = supplierRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Nhà cung cấp", id));
        supplier.setStatus(status);
        return toResponse(supplierRepository.save(supplier));
    }

    @Override
    @Transactional
    public void deleteSupplier(Integer id) {
        if (!supplierRepository.existsById(id)) {
            throw new ResourceNotFoundException("Nhà cung cấp", id);
        }
        supplierRepository.deleteById(id);
    }

    private SupplierResponse toResponse(Supplier supplier) {
        return SupplierResponse.builder()
                .id(supplier.getId())
                .name(supplier.getName())
                .phone(supplier.getPhone())
                .email(supplier.getEmail())
                .taxCode(supplier.getTaxCode())
                .address(supplier.getAddress())
                .status(supplier.getStatus())
                .build();
    }
}
