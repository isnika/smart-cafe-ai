package com.smart_cafe_ai.order_service.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "Identity_User_Status")
public class IdentityUserStatus {
    @Id @Column(name = "user_id", length = 36) public String userId;
    @Column(name = "status", nullable = false, length = 20) public String status;
    @Column(name = "status_revision", nullable = false) public long statusRevision;
    @Column(name = "occurred_at", nullable = false) public Instant occurredAt;
}
