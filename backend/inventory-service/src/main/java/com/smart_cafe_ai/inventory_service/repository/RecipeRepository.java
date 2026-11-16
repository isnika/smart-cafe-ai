package com.smart_cafe_ai.inventory_service.repository;

import com.smart_cafe_ai.inventory_service.entity.Recipe;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RecipeRepository extends JpaRepository<Recipe, Long> {
    List<Recipe> findByVariantId(Integer variantId);
    Optional<Recipe> findByVariantIdAndIngredientId(Integer variantId, Integer ingredientId);
    void deleteByVariantId(Integer variantId);
    boolean existsByIngredientId(Integer ingredientId);

    @Query("SELECT DISTINCT r.variantId FROM Recipe r WHERE (:variantId IS NULL OR r.variantId = :variantId)")
    Page<Integer> findDistinctVariantIds(@Param("variantId") Integer variantId, Pageable pageable);
}
