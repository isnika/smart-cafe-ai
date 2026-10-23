package com.smart_cafe_ai.catalog_service.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "Product_Option_Groups")
@Getter
@NoArgsConstructor
public class ProductOptionGroup {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @Column(name = "product_id", nullable = false)
    private Integer productId;
    @Column(nullable = false, length = 50)
    private String name;
    @Enumerated(EnumType.STRING) @Column(name = "selection_type", nullable = false)
    private SelectionType selectionType;
    @Column(name = "is_required", nullable = false)
    private boolean required;
    @Column(name = "min_select", nullable = false, columnDefinition = "TINYINT UNSIGNED")
    private int minSelect;
    @Column(name = "max_select", nullable = false, columnDefinition = "TINYINT UNSIGNED")
    private int maxSelect;
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;
}

