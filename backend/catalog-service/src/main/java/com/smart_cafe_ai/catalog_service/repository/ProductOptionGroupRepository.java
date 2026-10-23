package com.smart_cafe_ai.catalog_service.repository;

import com.smart_cafe_ai.catalog_service.model.ProductOptionGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ProductOptionGroupRepository extends JpaRepository<ProductOptionGroup, Integer> {
    List<ProductOptionGroup> findByProductIdOrderBySortOrderAscIdAsc(Integer productId);
}

