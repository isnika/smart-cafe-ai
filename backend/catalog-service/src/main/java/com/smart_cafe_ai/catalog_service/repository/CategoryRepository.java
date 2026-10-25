package com.smart_cafe_ai.catalog_service.repository;

import com.smart_cafe_ai.catalog_service.dto.CatalogResponse.CategoryResponse;
import com.smart_cafe_ai.catalog_service.model.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;

public interface CategoryRepository extends JpaRepository<Category, Integer>, JpaSpecificationExecutor<Category> {
    boolean existsByNameIgnoreCase(String name);
    boolean existsByNameIgnoreCaseAndIdNot(String name, Integer id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Category c where c.id = :id")
    Optional<Category> findByIdForUpdate(@Param("id") Integer id);

    @Query("""
        select new com.smart_cafe_ai.catalog_service.dto.CatalogResponse$CategoryResponse(
            c.id, c.name, c.image, c.sortOrder, c.status, count(p.id))
        from Category c left join Product p on p.category.id = c.id and p.status = :active
        where c.status = :status
        group by c.id, c.name, c.image, c.sortOrder, c.status
        order by c.sortOrder, c.id
        """)
    List<CategoryResponse> findMenuCategories(@Param("status") MenuStatus status, @Param("active") MenuStatus active);
}

