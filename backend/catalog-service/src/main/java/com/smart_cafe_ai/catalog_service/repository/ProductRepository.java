package com.smart_cafe_ai.catalog_service.repository;

import com.smart_cafe_ai.catalog_service.model.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Integer>, JpaSpecificationExecutor<Product> {
    @Override
    @EntityGraph(attributePaths = "category")
    Page<Product> findAll(Specification<Product> spec, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Product p where p.id = :id")
    Optional<Product> findByIdForUpdate(@Param("id") Integer id);
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

