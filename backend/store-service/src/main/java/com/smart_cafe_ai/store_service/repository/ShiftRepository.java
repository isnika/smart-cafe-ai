package com.smart_cafe_ai.store_service.repository;

import com.smart_cafe_ai.store_service.entity.Shift;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ShiftRepository extends JpaRepository<Shift, Integer> {
    List<Shift> findAllByBranchId(Integer branchId);
    List<Shift> findAllByBranchIdAndIsActive(Integer branchId, Boolean isActive);
    boolean existsByBranchIdAndName(Integer branchId, String name);
}
