package com.smart_cafe_ai.inventory_service.repository;

import com.smart_cafe_ai.inventory_service.entity.Ingredient;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface IngredientRepository extends JpaRepository<Ingredient, Integer> {
    @Query("SELECT i FROM Ingredient i WHERE " +
           "(:name IS NULL OR LOWER(i.name) LIKE LOWER(CONCAT('%', :name, '%'))) AND " +
           "(:isActive IS NULL OR i.isActive = :isActive)")
    Page<Ingredient> findByFilter(@Param("name") String name,
                                  @Param("isActive") Boolean isActive,
                                  Pageable pageable);

    Page<Ingredient> findByNameContainingIgnoreCase(String name, Pageable pageable);
    boolean existsByNameIgnoreCase(String name);
}
