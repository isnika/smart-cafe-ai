package com.smart_cafe_ai.inventory_service.service.impl;

import com.smart_cafe_ai.inventory_service.dto.option.OptionRecipeAdjustmentItemRequest;
import com.smart_cafe_ai.inventory_service.dto.option.OptionRecipeAdjustmentRequest;
import com.smart_cafe_ai.inventory_service.dto.option.OptionRecipeAdjustmentResponse;
import com.smart_cafe_ai.inventory_service.entity.Ingredient;
import com.smart_cafe_ai.inventory_service.entity.OptionRecipeAdjustment;
import com.smart_cafe_ai.inventory_service.exception.ResourceNotFoundException;
import com.smart_cafe_ai.inventory_service.repository.IngredientRepository;
import com.smart_cafe_ai.inventory_service.repository.OptionRecipeAdjustmentRepository;
import com.smart_cafe_ai.inventory_service.service.OptionRecipeAdjustmentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class OptionRecipeAdjustmentServiceImpl implements OptionRecipeAdjustmentService {

    private final OptionRecipeAdjustmentRepository optionRecipeAdjustmentRepository;
    private final IngredientRepository ingredientRepository;

    @Override
    @Transactional(readOnly = true)
    public List<OptionRecipeAdjustmentResponse> getAdjustmentsByOptionId(Integer optionId) {
        List<OptionRecipeAdjustment> adjustments = optionRecipeAdjustmentRepository.findByOptionId(optionId);
        return toResponses(adjustments);
    }

    @Override
    @Transactional
    public List<OptionRecipeAdjustmentResponse> setAdjustmentsForOption(Integer optionId, OptionRecipeAdjustmentRequest request) {
        optionRecipeAdjustmentRepository.deleteByOptionId(optionId);

        List<Integer> ingredientIds = request.getItems().stream()
                .map(OptionRecipeAdjustmentItemRequest::getIngredientId)
                .collect(Collectors.toList());

        Map<Integer, Ingredient> ingredientMap = ingredientRepository.findAllById(ingredientIds)
                .stream().collect(Collectors.toMap(Ingredient::getId, Function.identity()));

        List<OptionRecipeAdjustment> newEntities = new ArrayList<>();
        for (OptionRecipeAdjustmentItemRequest item : request.getItems()) {
            if (!ingredientMap.containsKey(item.getIngredientId())) {
                throw new ResourceNotFoundException("Nguyên liệu", item.getIngredientId());
            }
            OptionRecipeAdjustment entity = OptionRecipeAdjustment.builder()
                    .optionId(optionId)
                    .ingredientId(item.getIngredientId())
                    .quantityDelta(item.getQuantityDelta())
                    .build();
            newEntities.add(entity);
        }

        List<OptionRecipeAdjustment> saved = optionRecipeAdjustmentRepository.saveAll(newEntities);
        return toResponses(saved);
    }

    private List<OptionRecipeAdjustmentResponse> toResponses(List<OptionRecipeAdjustment> adjustments) {
        List<Integer> ingredientIds = adjustments.stream()
                .map(OptionRecipeAdjustment::getIngredientId)
                .distinct()
                .collect(Collectors.toList());

        Map<Integer, Ingredient> ingredientMap = ingredientRepository.findAllById(ingredientIds)
                .stream().collect(Collectors.toMap(Ingredient::getId, Function.identity()));

        return adjustments.stream().map(adj -> {
            Ingredient ing = ingredientMap.get(adj.getIngredientId());
            return OptionRecipeAdjustmentResponse.builder()
                    .id(adj.getId())
                    .optionId(adj.getOptionId())
                    .ingredientId(adj.getIngredientId())
                    .ingredientName(ing != null ? ing.getName() : "Unknown")
                    .quantityDelta(adj.getQuantityDelta())
                    .build();
        }).collect(Collectors.toList());
    }
}
