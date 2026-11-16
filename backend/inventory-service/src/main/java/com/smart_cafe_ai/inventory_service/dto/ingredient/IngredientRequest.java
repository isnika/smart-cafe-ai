package com.smart_cafe_ai.inventory_service.dto.ingredient;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IngredientRequest {

    @NotBlank(message = "Tên nguyên liệu không được để trống")
    @Size(max = 100, message = "Tên nguyên liệu tối đa 100 ký tự")
    private String name;

    @NotBlank(message = "Đơn vị không được để trống")
    @Size(max = 20, message = "Đơn vị tối đa 20 ký tự")
    private String unit;

    @DecimalMin(value = "0.0", message = "Chi phí trung bình phải >= 0")
    private BigDecimal averageCost;

    @Builder.Default
    private Boolean isActive = true;
}
