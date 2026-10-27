package com.smart_cafe_ai.inventory_service.service;

import com.smart_cafe_ai.inventory_service.dto.recipe.RecipeItemRequest;
import com.smart_cafe_ai.inventory_service.dto.recipe.RecipeItemResponse;
import com.smart_cafe_ai.inventory_service.dto.recipe.RecipeRequest;
import com.smart_cafe_ai.inventory_service.dto.recipe.RecipeResponse;
import com.smart_cafe_ai.inventory_service.dto.recipe.RecipeSummaryResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface RecipeService {
    Page<RecipeSummaryResponse> getRecipes(Integer branchId, Integer variantId, Pageable pageable);
    RecipeResponse getRecipeByVariantId(Integer variantId);
    RecipeResponse getRecipeByVariantId(Integer variantId, Integer branchId);
    RecipeResponse setRecipeForVariant(Integer variantId, RecipeRequest request);
    RecipeItemResponse addRecipeItem(Integer variantId, RecipeItemRequest item);
    RecipeItemResponse updateRecipeItem(Long id, RecipeItemRequest item);
    void deleteRecipeItem(Long id);
}
