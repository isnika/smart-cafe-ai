package com.smart_cafe_ai.catalog_service.repository;

import com.smart_cafe_ai.catalog_service.model.BranchOptionAvailability;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Collection;
import java.util.List;

public interface BranchOptionAvailabilityRepository extends JpaRepository<BranchOptionAvailability, Long> {
    List<BranchOptionAvailability> findByBranchIdAndOptionIdIn(Integer branchId, Collection<Integer> optionIds);
}

