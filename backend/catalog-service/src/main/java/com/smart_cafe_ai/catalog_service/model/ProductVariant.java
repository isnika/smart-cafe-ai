package com.smart_cafe_ai.catalog_service.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;

@Entity
@Table(name = "Product_Variants")
@Getter
@NoArgsConstructor
public class ProductVariant {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @Column(name = "product_id", nullable = false)
    private Integer productId;
    @Column(name = "variant_name", nullable = false, length = 50)
    private String variantName;
    @Column(nullable = false, precision = 15, scale = 0)
    private BigDecimal price;
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;
    @Enumerated(EnumType.STRING) @Column(nullable = false)
    private MenuStatus status;
}

