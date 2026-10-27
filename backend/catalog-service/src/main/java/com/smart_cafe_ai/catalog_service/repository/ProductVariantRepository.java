package com.smart_cafe_ai.catalog_service.repository;

import com.smart_cafe_ai.catalog_service.model.*;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.List;

public interface ProductVariantRepository extends JpaRepository<ProductVariant, Integer> {
    @Query("select v.productId from ProductVariant v where v.id = :id")
    java.util.Optional<Integer> productIdOf(@Param("id") Integer id);
    boolean existsByProductIdAndVariantNameIgnoreCaseAndIdNot(Integer productId,String name,Integer id);
    List<ProductVariant> findByIdIn(Collection<Integer> ids);
    boolean existsByProductId(Integer productId);
    interface Counts {
        Integer getProductId();
        Long getTotal();
        Long getActive();
    }
    @Query("select v.productId as productId, count(v.id) as total, " +
            "sum(case when v.status = :active then 1 else 0 end) as active from ProductVariant v " +
            "where v.productId in :ids group by v.productId")
    List<Counts> countByProductIds(@Param("ids") Collection<Integer> ids, @Param("active") MenuStatus active);
    List<ProductVariant> findByProductIdInAndStatusOrderBySortOrderAscIdAsc(Collection<Integer> productIds, MenuStatus status);
}

