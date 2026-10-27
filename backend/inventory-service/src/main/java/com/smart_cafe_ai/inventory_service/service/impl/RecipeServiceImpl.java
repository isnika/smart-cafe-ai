package com.smart_cafe_ai.inventory_service.service.impl;

import com.smart_cafe_ai.inventory_service.dto.recipe.*;
import com.smart_cafe_ai.inventory_service.entity.Ingredient;
import com.smart_cafe_ai.inventory_service.entity.Inventory;
import com.smart_cafe_ai.inventory_service.entity.Recipe;
import com.smart_cafe_ai.inventory_service.exception.ResourceNotFoundException;
import com.smart_cafe_ai.inventory_service.repository.IngredientRepository;
import com.smart_cafe_ai.inventory_service.repository.InventoryRepository;
import com.smart_cafe_ai.inventory_service.repository.RecipeRepository;
import com.smart_cafe_ai.inventory_service.service.RecipeService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class RecipeServiceImpl implements RecipeService {

    private final RecipeRepository recipeRepository;
    private final IngredientRepository ingredientRepository;
    private final InventoryRepository inventoryRepository;

    @Override
    @Transactional(readOnly = true)
    public Page<RecipeSummaryResponse> getRecipes(Integer branchId, Integer variantId, Pageable pageable) {
        Page<Integer> variantIds = recipeRepository.findDistinctVariantIds(variantId, pageable);

        return variantIds.map(vId -> {
            List<Recipe> recipes = recipeRepository.findByVariantId(vId);
            BigDecimal costPrice = calculateCostPrice(recipes, branchId);
            return RecipeSummaryResponse.builder()
                    .variantId(vId)
                    .ingredientCount(recipes.size())
                    .costPrice(costPrice)
                    .build();
        });
    }

    @Override
    @Transactional(readOnly = true)
    public RecipeResponse getRecipeByVariantId(Integer variantId) {
        return getRecipeByVariantId(variantId, null);
    }

    @Override
    @Transactional(readOnly = true)
    public RecipeResponse getRecipeByVariantId(Integer variantId, Integer branchId) {
        List<Recipe> recipes = recipeRepository.findByVariantId(variantId);
        if (recipes.isEmpty()) {
            throw new ResourceNotFoundException("Công thức cho variant", variantId);
        }
        return buildResponse(variantId, recipes, branchId);
    }

    @Override
    @Transactional
    public RecipeResponse setRecipeForVariant(Integer variantId, RecipeRequest request) {
        recipeRepository.deleteByVariantId(variantId);

        List<Integer> ingredientIds = request.getItems().stream()
                .map(RecipeItemRequest::getIngredientId)
                .collect(Collectors.toList());

        Map<Integer, Ingredient> ingredientMap = ingredientRepository.findAllById(ingredientIds)
                .stream().collect(Collectors.toMap(Ingredient::getId, Function.identity()));

        List<Recipe> newRecipes = new ArrayList<>();
        for (RecipeItemRequest item : request.getItems()) {
            if (!ingredientMap.containsKey(item.getIngredientId())) {
                throw new ResourceNotFoundException("Nguyên liệu", item.getIngredientId());
            }
            Recipe recipe = Recipe.builder()
                    .variantId(variantId)
                    .ingredientId(item.getIngredientId())
                    .quantityRequired(item.getQuantityRequired())
                    .build();
            newRecipes.add(recipe);
        }

        List<Recipe> saved = recipeRepository.saveAll(newRecipes);
        return buildResponse(variantId, saved, null);
    }

    @Override
    @Transactional
    public RecipeItemResponse addRecipeItem(Integer variantId, RecipeItemRequest item) {
        Ingredient ingredient = ingredientRepository.findById(item.getIngredientId())
                .orElseThrow(() -> new ResourceNotFoundException("Nguyên liệu", item.getIngredientId()));

        Optional<Recipe> existing = recipeRepository.findByVariantIdAndIngredientId(variantId, item.getIngredientId());
        Recipe recipe;
        if (existing.isPresent()) {
            recipe = existing.get();
            recipe.setQuantityRequired(item.getQuantityRequired());
        } else {
            recipe = Recipe.builder()
                    .variantId(variantId)
                    .ingredientId(item.getIngredientId())
                    .quantityRequired(item.getQuantityRequired())
                    .build();
        }
        Recipe saved = recipeRepository.save(recipe);

        BigDecimal avgCost = ingredient.getAverageCost() != null ? ingredient.getAverageCost() : BigDecimal.ZERO;
        return RecipeItemResponse.builder()
                .id(saved.getId())
                .recipeId(saved.getId())
                .ingredientId(saved.getIngredientId())
                .ingredientName(ingredient.getName())
                .unit(ingredient.getUnit())
                .quantityRequired(saved.getQuantityRequired())
                .averageCost(avgCost)
                .lineCost(avgCost.multiply(saved.getQuantityRequired()))
                .build();
    }

    @Override
    @Transactional
    public RecipeItemResponse updateRecipeItem(Long id, RecipeItemRequest item) {
        Recipe recipe = recipeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Dòng công thức", id));

        if (item.getIngredientId() != null) {
            if (!ingredientRepository.existsById(item.getIngredientId())) {
                throw new ResourceNotFoundException("Nguyên liệu", item.getIngredientId());
            }
            recipe.setIngredientId(item.getIngredientId());
        }
        recipe.setQuantityRequired(item.getQuantityRequired());
        Recipe saved = recipeRepository.save(recipe);

        Ingredient ingredient = ingredientRepository.findById(saved.getIngredientId()).orElse(null);
        BigDecimal avgCost = (ingredient != null && ingredient.getAverageCost() != null)
                ? ingredient.getAverageCost() : BigDecimal.ZERO;

        return RecipeItemResponse.builder()
                .id(saved.getId())
                .recipeId(saved.getId())
                .ingredientId(saved.getIngredientId())
                .ingredientName(ingredient != null ? ingredient.getName() : "Unknown")
                .unit(ingredient != null ? ingredient.getUnit() : "")
                .quantityRequired(saved.getQuantityRequired())
                .averageCost(avgCost)
                .lineCost(avgCost.multiply(saved.getQuantityRequired()))
                .build();
    }

    @Override
    @Transactional
    public void deleteRecipeItem(Long id) {
        if (!recipeRepository.existsById(id)) {
            throw new ResourceNotFoundException("Dòng công thức", id);
        }
        recipeRepository.deleteById(id);
    }

    private BigDecimal calculateCostPrice(List<Recipe> recipes, Integer branchId) {
        BigDecimal totalCost = BigDecimal.ZERO;
        for (Recipe r : recipes) {
            BigDecimal cost = getIngredientCost(r.getIngredientId(), branchId);
            totalCost = totalCost.add(cost.multiply(r.getQuantityRequired()));
        }
        return totalCost;
    }

    private BigDecimal getIngredientCost(Integer ingredientId, Integer branchId) {
        if (branchId != null) {
            Optional<Inventory> inv = inventoryRepository.findByBranchIdAndIngredientId(branchId, ingredientId);
            if (inv.isPresent() && inv.get().getAverageCost() != null && inv.get().getAverageCost().compareTo(BigDecimal.ZERO) > 0) {
                return inv.get().getAverageCost();
            }
        }
        return ingredientRepository.findById(ingredientId)
                .map(Ingredient::getAverageCost)
                .filter(Objects::nonNull)
                .orElse(BigDecimal.ZERO);
    }

    private RecipeResponse buildResponse(Integer variantId, List<Recipe> recipes, Integer branchId) {
        List<Integer> ingredientIds = recipes.stream()
                .map(Recipe::getIngredientId)
                .collect(Collectors.toList());

        Map<Integer, Ingredient> ingredientMap = ingredientRepository.findAllById(ingredientIds)
                .stream().collect(Collectors.toMap(Ingredient::getId, Function.identity()));

        BigDecimal totalCost = BigDecimal.ZERO;
        List<RecipeItemResponse> items = new ArrayList<>();

        for (Recipe recipe : recipes) {
            Ingredient ingredient = ingredientMap.get(recipe.getIngredientId());
            String ingredientName = ingredient != null ? ingredient.getName() : "Unknown";
            String unit = ingredient != null ? ingredient.getUnit() : "";
            BigDecimal avgCost = getIngredientCost(recipe.getIngredientId(), branchId);
            BigDecimal lineCost = avgCost.multiply(recipe.getQuantityRequired());

            items.add(RecipeItemResponse.builder()
                    .id(recipe.getId())
                    .recipeId(recipe.getId())
                    .ingredientId(recipe.getIngredientId())
                    .ingredientName(ingredientName)
                    .unit(unit)
                    .quantityRequired(recipe.getQuantityRequired())
                    .averageCost(avgCost)
                    .lineCost(lineCost)
                    .build());

            totalCost = totalCost.add(lineCost);
        }

        return RecipeResponse.builder()
                .variantId(variantId)
                .items(items)
                .costPrice(totalCost)
                .build();
    }
}
