package com.smart_cafe_ai.inventory_service.repository;

import com.smart_cafe_ai.inventory_service.entity.Inventory;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface InventoryRepository extends JpaRepository<Inventory, Long> {

    Optional<Inventory> findByBranchIdAndIngredientId(Integer branchId, Integer ingredientId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM Inventory i WHERE i.branchId = :branchId AND i.ingredientId = :ingredientId")
    Optional<Inventory> findByBranchIdAndIngredientIdForUpdate(
            @Param("branchId") Integer branchId,
            @Param("ingredientId") Integer ingredientId);

    List<Inventory> findByBranchId(Integer branchId);

    List<Inventory> findByBranchIdAndIngredientIdIn(Integer branchId, List<Integer> ingredientIds);

    @Query("SELECT i FROM Inventory i WHERE (:branchId IS NULL OR i.branchId = :branchId) AND (:ingredientId IS NULL OR i.ingredientId = :ingredientId)")
    List<Inventory> findByFilter(@Param("branchId") Integer branchId, @Param("ingredientId") Integer ingredientId);
}
