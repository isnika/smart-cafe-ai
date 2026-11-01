package com.smart_cafe_ai.order_service.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import static com.smart_cafe_ai.order_service.model.Types.*;

@Entity @Table(name="Carts")
public class Cart {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @Enumerated(EnumType.STRING) @Column(name="cart_source",nullable=false,length=10) public Source cartSource;
    @Column(name="branch_id",nullable=false) public Integer branchId;
    @Enumerated(EnumType.STRING) @Column(name="fulfillment_type",nullable=false,length=10) public Fulfillment fulfillmentType;
    @Column(name="user_id",length=36) public String userId;
    @Column(name="table_session_id") public Long tableSessionId;
    @Column(name="client_key",length=64) public String clientKey;
    @Enumerated(EnumType.STRING) @Column(nullable=false,length=10) public CartStatus status=CartStatus.Active;
    @Column(name="created_at",nullable=false) public LocalDateTime createdAt;
    @Column(name="updated_at",nullable=false) public LocalDateTime updatedAt;
    @OneToMany(mappedBy="cart",cascade=CascadeType.ALL,orphanRemoval=true) @OrderBy("id") public List<CartItem> items=new ArrayList<>();
    @PrePersist void create(){createdAt=updatedAt=LocalDateTime.now(ZoneOffset.UTC);}
    public void touch(){updatedAt=LocalDateTime.now(ZoneOffset.UTC);}
}
