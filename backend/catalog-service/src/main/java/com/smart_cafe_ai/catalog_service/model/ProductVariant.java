package com.smart_cafe_ai.catalog_service.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;

@Entity
@Table(name = "Product_Variants", uniqueConstraints = @UniqueConstraint(name="uq_variant_per_product",columnNames={"product_id","variant_name"}))
@org.hibernate.annotations.Check(constraints = "price >= 0")
@Getter
@NoArgsConstructor
public class ProductVariant {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @Column(name = "product_id", nullable = false)
    private Integer productId;
    @ManyToOne(fetch=FetchType.LAZY)
    @JoinColumn(name="product_id",insertable=false,updatable=false,foreignKey=@ForeignKey(name="fk_variants_product"))
    private Product product;
    @Column(name = "variant_name", nullable = false, length = 50)
    private String variantName;
    @Column(nullable = false, precision = 15, scale = 0)
    private BigDecimal price;
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;
    @Enumerated(EnumType.STRING) @Column(nullable = false)
    private MenuStatus status;

    public ProductVariant(Integer productId, String variantName, BigDecimal price, int sortOrder, MenuStatus status) {
        this.productId = productId;
        this.variantName = variantName;
        this.price = price;
        this.sortOrder = sortOrder;
        this.status = status;
    }
    public void replace(String name, int order, MenuStatus status) { this.variantName=name; this.sortOrder=order; this.status=status; }
    public void changeStatus(MenuStatus status) { this.status=status; }
    public void changePrice(BigDecimal price) { this.price=price; }
}

