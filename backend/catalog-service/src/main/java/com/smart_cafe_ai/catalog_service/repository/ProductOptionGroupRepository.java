package com.smart_cafe_ai.catalog_service.repository;

import com.smart_cafe_ai.catalog_service.model.ProductOptionGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.List;

public interface ProductOptionGroupRepository extends JpaRepository<ProductOptionGroup, Integer> {
    @Query("select g.productId from ProductOptionGroup g where g.id = :id")
    java.util.Optional<Integer> productIdOf(@Param("id") Integer id);
    boolean existsByProductIdAndNameIgnoreCaseAndIdNot(Integer productId,String name,Integer id);
    List<ProductOptionGroup> findByProductIdIn(Collection<Integer> ids);
    boolean existsByProductId(Integer productId);
    interface Counts {
        Integer getProductId();
        Long getTotal();
    }
    @Query("select g.productId as productId, count(g.id) as total from ProductOptionGroup g " +
            "where g.productId in :ids group by g.productId")
    List<Counts> countByProductIds(@Param("ids") Collection<Integer> ids);
    List<ProductOptionGroup> findByProductIdOrderBySortOrderAscIdAsc(Integer productId);
}

