package com.smart_cafe_ai.inventory_service.service.impl;

import com.smart_cafe_ai.inventory_service.dto.ingredient.IngredientRequest;
import com.smart_cafe_ai.inventory_service.dto.ingredient.IngredientResponse;
import com.smart_cafe_ai.inventory_service.entity.Ingredient;
import com.smart_cafe_ai.inventory_service.exception.ResourceNotFoundException;
import com.smart_cafe_ai.inventory_service.repository.IngredientRepository;
import com.smart_cafe_ai.inventory_service.service.IngredientService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
@Slf4j
public class IngredientServiceImpl implements IngredientService {

    private final IngredientRepository ingredientRepository;

    @Override
    @Transactional(readOnly = true)
    public Page<IngredientResponse> getIngredients(String q, Pageable pageable) {
        return getIngredients(q, null, pageable);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<IngredientResponse> getIngredients(String q, Boolean isActive, Pageable pageable) {
        return ingredientRepository.findByFilter(StringUtils.hasText(q) ? q : null, isActive, pageable)
                .map(this::toResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public IngredientResponse getIngredientById(Integer id) {
        return ingredientRepository.findById(id)
                .map(this::toResponse)
                .orElseThrow(() -> new ResourceNotFoundException("Nguyên liệu", id));
    }

    @Override
    @Transactional
    public IngredientResponse createIngredient(IngredientRequest request) {
        Ingredient ingredient = Ingredient.builder()
                .name(request.getName())
                .unit(request.getUnit())
                .averageCost(request.getAverageCost())
                .isActive(request.getIsActive() != null ? request.getIsActive() : true)
                .build();
        return toResponse(ingredientRepository.save(ingredient));
    }

    @Override
    @Transactional
    public IngredientResponse updateIngredient(Integer id, IngredientRequest request) {
        Ingredient ingredient = ingredientRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Nguyên liệu", id));
        ingredient.setName(request.getName());
        ingredient.setUnit(request.getUnit());
        if (request.getAverageCost() != null) {
            ingredient.setAverageCost(request.getAverageCost());
        }
        if (request.getIsActive() != null) {
            ingredient.setIsActive(request.getIsActive());
        }
        return toResponse(ingredientRepository.save(ingredient));
    }

    @Override
    @Transactional
    public IngredientResponse updateActiveStatus(Integer id, Boolean isActive) {
        Ingredient ingredient = ingredientRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Nguyên liệu", id));
        ingredient.setIsActive(isActive);
        return toResponse(ingredientRepository.save(ingredient));
    }

    @Override
    @Transactional
    public void deleteIngredient(Integer id) {
        if (!ingredientRepository.existsById(id)) {
            throw new ResourceNotFoundException("Nguyên liệu", id);
        }
        ingredientRepository.deleteById(id);
    }

    private IngredientResponse toResponse(Ingredient ingredient) {
        return IngredientResponse.builder()
                .id(ingredient.getId())
                .name(ingredient.getName())
                .unit(ingredient.getUnit())
                .averageCost(ingredient.getAverageCost())
                .isActive(ingredient.getIsActive())
                .build();
    }
}
