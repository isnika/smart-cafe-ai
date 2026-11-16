package com.smart_cafe_ai.inventory_service.service;

import com.smart_cafe_ai.inventory_service.dto.option.OptionRecipeAdjustmentRequest;
import com.smart_cafe_ai.inventory_service.dto.option.OptionRecipeAdjustmentResponse;

import java.util.List;

public interface OptionRecipeAdjustmentService {
    List<OptionRecipeAdjustmentResponse> getAdjustmentsByOptionId(Integer optionId);
    List<OptionRecipeAdjustmentResponse> setAdjustmentsForOption(Integer optionId, OptionRecipeAdjustmentRequest request);
}
