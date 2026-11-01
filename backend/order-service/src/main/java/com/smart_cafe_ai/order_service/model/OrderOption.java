package com.smart_cafe_ai.order_service.model;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.math.BigDecimal;
@Entity @Table(name="Order_Item_Options",uniqueConstraints=@UniqueConstraint(columnNames={"order_item_id","option_id"}))
public class OrderOption {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="order_item_id") @JsonIgnore public OrderItem item;
    @Column(name="option_id",nullable=false) public Integer optionId;
    @Column(name="option_name",nullable=false,length=100) public String optionName;
    @Column(nullable=false) public int quantity;
    @Column(name="unit_price",nullable=false,precision=15,scale=0) public BigDecimal unitPrice;
}
