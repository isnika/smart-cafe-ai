package com.smart_cafe_ai.catalog_service.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;

@Entity
@Table(name = "Product_Options")
@Getter
@NoArgsConstructor
public class ProductOption {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @Column(name = "group_id", nullable = false)
    private Integer groupId;
    @Column(name = "option_name", nullable = false, length = 100)
    private String optionName;
    @Column(name = "extra_price", nullable = false, precision = 15, scale = 0)
    private BigDecimal extraPrice;
    @Column(name = "is_default", nullable = false)
    private boolean defaultOption;
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;
    @Enumerated(EnumType.STRING) @Column(nullable = false)
    private MenuStatus status;
}

