package com.smart_cafe_ai.order_service.model;

import com.fasterxml.jackson.annotation.*;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.*;

@Entity @Table(name="Order_Items")
public class OrderItem {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="order_id") @JsonIgnore public CafeOrder order;
    @Column(name="product_id",nullable=false) public Integer productId;
    @Column(name="variant_id",nullable=false) public Integer variantId;
    @Column(name="product_name",nullable=false,length=100) public String productName;
    @Column(name="variant_name",nullable=false,length=50) public String variantName;
    @Column(nullable=false) public int quantity;
    @Column(name="unit_price",nullable=false,precision=15,scale=0) public BigDecimal unitPrice;
    @Column(name="options_unit_total",nullable=false,precision=15,scale=0) public BigDecimal optionsUnitTotal=BigDecimal.ZERO;
    @Column(name="discount_amount",nullable=false,precision=15,scale=0) public BigDecimal discountAmount=BigDecimal.ZERO;
    @Column(name="is_reward_item",nullable=false) public boolean isRewardItem;
    @Column(length=255) public String note;
    @OneToMany(mappedBy="item",cascade=CascadeType.ALL) @OrderBy("id") public List<OrderOption> options=new ArrayList<>();
    // The original SQL owns the generated line_total column; Hibernate never writes it.
    @JsonProperty("line_total") public BigDecimal lineTotal(){return unitPrice.add(optionsUnitTotal).multiply(BigDecimal.valueOf(quantity)).subtract(discountAmount);}
}
