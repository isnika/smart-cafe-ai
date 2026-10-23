package com.smart_cafe_ai.catalog_service.repository;

import com.smart_cafe_ai.catalog_service.dto.CatalogResponse.CategoryResponse;
import com.smart_cafe_ai.catalog_service.model.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface CategoryRepository extends JpaRepository<Category, Integer> {
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

