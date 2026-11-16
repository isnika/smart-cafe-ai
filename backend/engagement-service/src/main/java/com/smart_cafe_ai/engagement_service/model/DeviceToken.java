package com.smart_cafe_ai.engagement_service.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.persistence.*;
import java.time.Instant;
import static com.smart_cafe_ai.engagement_service.model.Types.*;

@Entity @Table(name = "Device_Tokens", uniqueConstraints = @UniqueConstraint(columnNames = {"platform", "token"}))
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class DeviceToken {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "user_id", nullable = false, length = 36) public String userId;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public Platform platform;
    @JsonIgnore @Column(nullable = false, length = 512) public String token;
    @JsonProperty("is_active") @Column(name = "is_active", nullable = false) public boolean active = true;
    @Column(name = "created_at", nullable = false) public Instant createdAt = Instant.now();
    @Column(name = "last_seen_at") public Instant lastSeenAt;
}
