package com.smart_cafe_ai.catalog_service.repository;

import com.smart_cafe_ai.catalog_service.model.*;
import org.springframework.data.jpa.repository.*;
import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Integer>, JpaSpecificationExecutor<Product> {
    Optional<Product> findByIdAndStatusAndCategoryStatus(Integer id, MenuStatus status, MenuStatus categoryStatus);
}

