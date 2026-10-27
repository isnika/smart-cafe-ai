package com.smart_cafe_ai.catalog_service.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Formula;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

@Entity
@Table(name = "Products")
@Getter
@NoArgsConstructor
public class Product {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;
    @Column(nullable = false, length = 100)
    private String name;
    private String image;
    @Column(columnDefinition = "TEXT")
    private String description;
    @Enumerated(EnumType.STRING)
    private Temperature temperature;
    @Enumerated(EnumType.STRING) @Column(name = "caffeine_level", nullable = false)
    private CaffeineLevel caffeineLevel;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "flavor_tags", columnDefinition = "JSON")
    private List<String> flavorTags;
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;
    @Enumerated(EnumType.STRING) @Column(nullable = false)
    private MenuStatus status;
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    // Display prices are derived from globally active variants, never copied to Products.
    @Formula("(select min(v.price) from Product_Variants v where v.product_id = id and v.status = 'Active')")
    private BigDecimal price;
    @Formula("(select max(v.price) from Product_Variants v where v.product_id = id and v.status = 'Active')")
    private BigDecimal maxPrice;

    public Product(Category category, String name, String image, String description, Temperature temperature,
                   CaffeineLevel caffeineLevel, List<String> flavorTags, int sortOrder, MenuStatus status) {
        replace(category, name, image, description, temperature, caffeineLevel, flavorTags, sortOrder, status);
    }

    public void replace(Category category, String name, String image, String description, Temperature temperature,
                        CaffeineLevel caffeineLevel, List<String> flavorTags, int sortOrder, MenuStatus status) {
        this.category = category;
        this.name = name;
        this.image = image;
        this.description = description;
        this.temperature = temperature;
        this.caffeineLevel = caffeineLevel;
        this.flavorTags = List.copyOf(flavorTags);
        this.sortOrder = sortOrder;
        this.status = status;
    }

    public void changeStatus(MenuStatus status) { this.status = status; }

    @PrePersist
    void created() { createdAt = updatedAt = LocalDateTime.now(ZoneOffset.UTC).withNano(0); }

    @PreUpdate
    void updated() { updatedAt = LocalDateTime.now(ZoneOffset.UTC).withNano(0); }
}

