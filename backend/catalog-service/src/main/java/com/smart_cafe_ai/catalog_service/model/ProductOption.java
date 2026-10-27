package com.smart_cafe_ai.catalog_service.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;

@Entity
@Table(name = "Product_Options",uniqueConstraints=@UniqueConstraint(name="uq_option_per_group",columnNames={"group_id","option_name"}))
@org.hibernate.annotations.Check(constraints="extra_price >= 0")
@Getter
@NoArgsConstructor
public class ProductOption {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @Column(name = "group_id", nullable = false)
    private Integer groupId;
    @ManyToOne(fetch=FetchType.LAZY)
    @JoinColumn(name="group_id",insertable=false,updatable=false,foreignKey=@ForeignKey(name="fk_options_group"))
    private ProductOptionGroup group;
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

    public ProductOption(Integer groupId, String optionName, BigDecimal extraPrice, boolean defaultOption,
                         int sortOrder, MenuStatus status) {
        this.groupId = groupId;
        this.optionName = optionName;
        this.extraPrice = extraPrice;
        this.defaultOption = defaultOption;
        this.sortOrder = sortOrder;
        this.status = status;
    }
    public void replace(String name, BigDecimal price, boolean defaultOption, int order, MenuStatus status) {
        this.optionName=name; this.extraPrice=price; this.defaultOption=defaultOption; this.sortOrder=order; this.status=status;
    }
    public void changeStatus(MenuStatus status) { this.status=status; }
}

