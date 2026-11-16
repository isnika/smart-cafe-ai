package com.smart_cafe_ai.catalog_service.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "Product_Option_Groups", uniqueConstraints=@UniqueConstraint(name="uq_option_group_per_product",columnNames={"product_id","name"}))
@org.hibernate.annotations.Check(constraints="max_select >= 1 AND min_select <= max_select AND (selection_type <> 'Single' OR max_select = 1) AND (is_required = FALSE OR min_select >= 1)")
@Getter
@NoArgsConstructor
public class ProductOptionGroup {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @Column(name = "product_id", nullable = false)
    private Integer productId;
    @ManyToOne(fetch=FetchType.LAZY)
    @JoinColumn(name="product_id",insertable=false,updatable=false,foreignKey=@ForeignKey(name="fk_option_groups_product"))
    private Product product;
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

    public ProductOptionGroup(Integer productId, String name, SelectionType selectionType, boolean required,
                              int minSelect, int maxSelect, int sortOrder) {
        this.productId = productId;
        this.name = name;
        this.selectionType = selectionType;
        this.required = required;
        this.minSelect = minSelect;
        this.maxSelect = maxSelect;
        this.sortOrder = sortOrder;
    }
    public void replace(String name, SelectionType type, boolean required, int min, int max, int order) {
        this.name=name; this.selectionType=type; this.required=required; this.minSelect=min; this.maxSelect=max; this.sortOrder=order;
    }
}

