package com.smart_cafe_ai.catalog_service.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "Categories")
@Getter
@NoArgsConstructor
public class Category {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @Column(nullable = false, unique = true, length = 100)
    private String name;
    private String image;
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;
    @Enumerated(EnumType.STRING) @Column(nullable = false)
    private MenuStatus status;
}

