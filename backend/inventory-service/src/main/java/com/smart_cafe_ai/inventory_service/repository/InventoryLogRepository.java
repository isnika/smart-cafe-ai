package com.smart_cafe_ai.inventory_service.repository;

import com.smart_cafe_ai.inventory_service.entity.InventoryLog;
import com.smart_cafe_ai.inventory_service.enums.TransactionType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface InventoryLogRepository extends JpaRepository<InventoryLog, Long> {

    @Query("SELECT l FROM InventoryLog l WHERE " +
            "(:branchId IS NULL OR l.branchId = :branchId) AND " +
            "(:ingredientId IS NULL OR l.ingredientId = :ingredientId) AND " +
            "(:type IS NULL OR l.transactionType = :type)")
    Page<InventoryLog> findByFilter(
            @Param("branchId") Integer branchId,
            @Param("ingredientId") Integer ingredientId,
            @Param("type") TransactionType type,
            Pageable pageable);

    @Query("SELECT l FROM InventoryLog l WHERE " +
            "(:branchId IS NULL OR l.branchId = :branchId) AND " +
            "l.createdAt BETWEEN :from AND :to")
    List<InventoryLog> findLogsByBranchAndDateRange(
            @Param("branchId") Integer branchId,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    @Query("SELECT l FROM InventoryLog l WHERE " +
            "(:branchId IS NULL OR l.branchId = :branchId) AND " +
            "l.createdAt BETWEEN :from AND :to AND " +
            "l.transactionType = 'Import'")
    List<InventoryLog> findImportLogsByBranchAndDateRange(
            @Param("branchId") Integer branchId,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);
}
