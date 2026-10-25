package com.smart_cafe_ai.catalog_service.repository;

import com.smart_cafe_ai.catalog_service.model.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Integer>, JpaSpecificationExecutor<Product> {
    Optional<Product> findByIdAndStatusAndCategoryStatus(Integer id, MenuStatus status, MenuStatus categoryStatus);

    long countByCategoryIdAndStatus(Integer categoryId, MenuStatus status);

    boolean existsByCategoryId(Integer categoryId);

    interface CategoryCounts {
        Integer getCategoryId();
        Long getTotalProductCount();
        Long getActiveProductCount();
    }

    @Query("select p.category.id as categoryId, count(p.id) as totalProductCount, " +
            "sum(case when p.status = :active then 1 else 0 end) as activeProductCount from Product p " +
            "where p.category.id in :ids group by p.category.id")
    List<CategoryCounts> countByCategoryIds(@Param("ids") Collection<Integer> ids, @Param("active") MenuStatus active);
}

