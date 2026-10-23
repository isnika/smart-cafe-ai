package com.smart_cafe_ai.catalog_service.repository;

import com.smart_cafe_ai.catalog_service.model.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Collection;
import java.util.List;

public interface ProductVariantRepository extends JpaRepository<ProductVariant, Integer> {
    List<ProductVariant> findByProductIdInAndStatusOrderBySortOrderAscIdAsc(Collection<Integer> productIds, MenuStatus status);
}

