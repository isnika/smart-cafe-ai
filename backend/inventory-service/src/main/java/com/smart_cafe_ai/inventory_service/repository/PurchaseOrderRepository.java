package com.smart_cafe_ai.inventory_service.repository;

import com.smart_cafe_ai.inventory_service.entity.PurchaseOrder;
import com.smart_cafe_ai.inventory_service.enums.PurchaseOrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;

@Repository
public interface PurchaseOrderRepository extends JpaRepository<PurchaseOrder, Long> {

    @Query("SELECT p FROM PurchaseOrder p WHERE " +
           "(:branchId IS NULL OR p.branchId = :branchId) AND " +
           "(:supplierId IS NULL OR p.supplierId = :supplierId) AND " +
           "(:status IS NULL OR p.status = :status) AND " +
           "(:from IS NULL OR p.createdAt >= :from) AND " +
           "(:to IS NULL OR p.createdAt <= :to)")
    Page<PurchaseOrder> findByFilter(
            @Param("branchId") Integer branchId,
            @Param("supplierId") Integer supplierId,
            @Param("status") PurchaseOrderStatus status,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to,
            Pageable pageable);

    @Query("SELECT p FROM PurchaseOrder p WHERE (:branchId IS NULL OR p.branchId = :branchId) AND (:status IS NULL OR p.status = :status)")
    Page<PurchaseOrder> findByFilter(
            @Param("branchId") Integer branchId,
            @Param("status") PurchaseOrderStatus status,
            Pageable pageable);
}
