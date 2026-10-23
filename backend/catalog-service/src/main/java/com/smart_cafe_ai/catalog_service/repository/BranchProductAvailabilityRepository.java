package com.smart_cafe_ai.catalog_service.repository;

import com.smart_cafe_ai.catalog_service.model.BranchProductAvailability;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Collection;
import java.util.List;

public interface BranchProductAvailabilityRepository extends JpaRepository<BranchProductAvailability, Long> {
    List<BranchProductAvailability> findByBranchIdAndVariantIdIn(Integer branchId, Collection<Integer> variantIds);
}

