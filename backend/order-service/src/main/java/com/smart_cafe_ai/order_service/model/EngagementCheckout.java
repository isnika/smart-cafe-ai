package com.smart_cafe_ai.order_service.model;

import jakarta.persistence.*;
import java.time.*;

/** Independent durable recovery record; deliberately no FK to the uncommitted Order row. */
@Entity @Table(name="Engagement_Checkouts")
public class EngagementCheckout {
    @Id @Column(name="order_id") public Long orderId;
    @Column(name="user_id",nullable=false,length=36) public String userId;
    @Column(nullable=false,length=12) public String status="Pending";
    @Column(name="retry_count",nullable=false) public int retryCount;
    @Column(name="next_retry_at",nullable=false) public LocalDateTime nextRetryAt=LocalDateTime.now(ZoneOffset.UTC).plusMinutes(10);
    @Column(name="last_error",length=100) public String lastError;
}
