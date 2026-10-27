package com.smart_cafe_ai.catalog_service.repository;

import com.smart_cafe_ai.catalog_service.model.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Collection;
import java.util.List;

public interface ProductOptionRepository extends JpaRepository<ProductOption, Integer> {
    @org.springframework.data.jpa.repository.Query("select g.productId from ProductOption o join ProductOptionGroup g on g.id=o.groupId where o.id=:id")
    java.util.Optional<Integer> productIdOf(@org.springframework.data.repository.query.Param("id") Integer id);
    boolean existsByGroupIdAndOptionNameIgnoreCaseAndIdNot(Integer groupId,String name,Integer id);
    List<ProductOption> findByIdIn(Collection<Integer> ids);
    List<ProductOption> findByGroupIdInAndStatusOrderBySortOrderAscIdAsc(Collection<Integer> groupIds, MenuStatus status);
}

