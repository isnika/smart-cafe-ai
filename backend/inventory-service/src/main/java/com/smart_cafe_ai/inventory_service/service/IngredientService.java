package com.smart_cafe_ai.inventory_service.service;

import com.smart_cafe_ai.inventory_service.dto.ingredient.IngredientRequest;
import com.smart_cafe_ai.inventory_service.dto.ingredient.IngredientResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface IngredientService {
    Page<IngredientResponse> getIngredients(String q, Pageable pageable);
    Page<IngredientResponse> getIngredients(String q, Boolean isActive, Pageable pageable);
    IngredientResponse getIngredientById(Integer id);
    IngredientResponse createIngredient(IngredientRequest request);
    IngredientResponse updateIngredient(Integer id, IngredientRequest request);
    IngredientResponse updateActiveStatus(Integer id, Boolean isActive);
    void deleteIngredient(Integer id);
}
