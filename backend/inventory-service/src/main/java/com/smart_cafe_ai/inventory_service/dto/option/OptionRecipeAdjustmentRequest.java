package com.smart_cafe_ai.inventory_service.dto.option;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OptionRecipeAdjustmentRequest {

    @NotEmpty(message = "Danh sách điều chỉnh không được để trống")
    @Valid
    private List<OptionRecipeAdjustmentItemRequest> items;
}
