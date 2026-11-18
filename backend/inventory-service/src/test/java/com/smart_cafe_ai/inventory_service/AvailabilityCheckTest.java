package com.smart_cafe_ai.inventory_service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.inventory_service.dto.internal.*;
import com.smart_cafe_ai.inventory_service.entity.*;
import com.smart_cafe_ai.inventory_service.repository.*;
import com.smart_cafe_ai.inventory_service.service.impl.InventoryServiceImpl;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class AvailabilityCheckTest {
    @Test void combinesSharedIngredientDemandAndSubtractsReservations() {
        var inventories=mock(InventoryRepository.class);var ingredients=mock(IngredientRepository.class);
        var recipes=mock(RecipeRepository.class);var adjustments=mock(OptionRecipeAdjustmentRepository.class);
        var service=new InventoryServiceImpl(inventories,ingredients,mock(InventoryLogRepository.class),recipes,adjustments,
                mock(OutboxEventRepository.class),mock(ProcessedEventRepository.class),new ObjectMapper());
        when(recipes.findByVariantId(anyInt())).thenAnswer(inv->List.of(Recipe.builder().variantId(inv.getArgument(0))
                .ingredientId(7).quantityRequired(BigDecimal.ONE).build()));
        when(inventories.findByBranchIdAndIngredientId(1,7)).thenReturn(Optional.of(Inventory.builder()
                .quantityInStock(new BigDecimal("5")).reservedQuantity(BigDecimal.ONE).build()));
        var request=AvailabilityCheckRequest.builder().branchId(1).items(List.of(
                AvailabilityCheckItem.builder().variantId(1).quantity(3).build(),
                AvailabilityCheckItem.builder().variantId(2).quantity(2).build())).build();
        var result=service.checkAvailability(request);
        assertThat(result.isAvailable()).isFalse();
        assertThat(result.getInsufficientItems()).anySatisfy(item->{
            assertThat(item.getIngredientId()).isEqualTo(7);
            assertThat(item.getRequired()).isEqualByComparingTo("5");
            assertThat(item.getAvailable()).isEqualByComparingTo("4");
        });
    }
}
