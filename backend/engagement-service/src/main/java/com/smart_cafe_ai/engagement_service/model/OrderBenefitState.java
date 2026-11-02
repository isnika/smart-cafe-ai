package com.smart_cafe_ai.engagement_service.model;

import jakarta.persistence.*;

@Entity @Table(name="Order_Benefit_State")
public class OrderBenefitState {
    @Id @Column(name="order_id") public Long orderId;
    @Column(name="user_id",length=36) public String userId;
    @Column(nullable=false,length=12) public String status="Active";
}
