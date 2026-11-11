package com.smart_cafe_ai.inventory_service.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "Inventories",
        uniqueConstraints = @UniqueConstraint(columnNames = {"branch_id", "ingredient_id"}))
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Inventory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "branch_id", nullable = false)
    private Integer branchId;

    @Column(name = "ingredient_id", nullable = false)
    private Integer ingredientId;

    @Column(name = "quantity_in_stock", nullable = false, precision = 10, scale = 3)
    private BigDecimal quantityInStock;

    @Column(name = "reserved_quantity", nullable = false, precision = 14, scale = 3)
    @Builder.Default
    private BigDecimal reservedQuantity = BigDecimal.ZERO;

    @Column(name = "reorder_level", nullable = false, precision = 14, scale = 3)
    @Builder.Default
    private BigDecimal reorderLevel = BigDecimal.ZERO;

    @Column(name = "average_cost", nullable = false, precision = 15, scale = 4)
    @Builder.Default
    private BigDecimal averageCost = BigDecimal.ZERO;

    @Version
    @Column(name = "version")
    private Long version;
}
