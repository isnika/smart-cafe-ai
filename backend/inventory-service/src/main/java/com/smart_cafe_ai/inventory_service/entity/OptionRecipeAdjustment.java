package com.smart_cafe_ai.inventory_service.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "Option_Recipe_Adjustments")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OptionRecipeAdjustment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "option_id", nullable = false)
    private Integer optionId;

    @Column(name = "ingredient_id", nullable = false)
    private Integer ingredientId;

    @Column(name = "quantity_delta", nullable = false, precision = 12, scale = 3)
    private BigDecimal quantityDelta;
}
