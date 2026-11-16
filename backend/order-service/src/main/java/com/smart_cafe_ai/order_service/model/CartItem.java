package com.smart_cafe_ai.order_service.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.util.*;

@Entity @Table(name="Cart_Items")
public class CartItem {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="cart_id") @JsonIgnore public Cart cart;
    @Column(name="variant_id",nullable=false) public Integer variantId;
    @Column(nullable=false) public int quantity;
    @Column(length=255) public String note;
    @OneToMany(mappedBy="item",cascade=CascadeType.ALL,orphanRemoval=true) @OrderBy("id") public List<CartOption> options=new ArrayList<>();
}
