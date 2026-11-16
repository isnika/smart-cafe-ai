package com.smart_cafe_ai.engagement_service.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity @Table(name = "Verified_Purchases", uniqueConstraints = @UniqueConstraint(columnNames = {"order_item_id", "user_id", "product_id"}))
public class VerifiedPurchase {
    @Id @Column(name = "order_item_id") public Long orderItemId;
    @Column(name = "order_id", nullable = false) public Long orderId;
    @Column(name = "user_id", nullable = false, length = 36) public String userId;
    @Column(name = "product_id", nullable = false) public Integer productId;
    @Column(name = "branch_id", nullable = false) public Integer branchId;
    @Column(name = "purchased_at", nullable = false) public Instant purchasedAt;
}
