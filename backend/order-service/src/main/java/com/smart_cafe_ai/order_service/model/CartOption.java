package com.smart_cafe_ai.order_service.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

@Entity @Table(name="Cart_Item_Options",uniqueConstraints=@UniqueConstraint(columnNames={"cart_item_id","option_id"}))
public class CartOption {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="cart_item_id") @JsonIgnore public CartItem item;
    @Column(name="option_id",nullable=false) public Integer optionId;
    @Column(nullable=false) public int quantity;
}
