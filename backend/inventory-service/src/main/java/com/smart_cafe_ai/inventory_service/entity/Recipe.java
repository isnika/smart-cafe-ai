package com.smart_cafe_ai.inventory_service.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "Recipes",
        uniqueConstraints = @UniqueConstraint(columnNames = {"variant_id", "ingredient_id"}))
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Recipe {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "variant_id", nullable = false)
    private Integer variantId;

    @Column(name = "ingredient_id", nullable = false)
    private Integer ingredientId;

    @Column(name = "quantity_required", nullable = false, precision = 10, scale = 3)
    private BigDecimal quantityRequired;
}
