package com.smart_cafe_ai.engagement_service.model;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.persistence.*;
import org.hibernate.annotations.Check;
import java.time.Instant;

@Entity @Table(name = "Loyalty_Cards")
@Check(constraints = "current_stamps >= -100")
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class LoyaltyCard {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "user_id", nullable = false, unique = true, length = 36) public String userId;
    @Column(name = "current_stamps", nullable = false) public int currentStamps;
    @Column(name = "lifetime_stamps_earned", nullable = false) public int lifetimeStampsEarned;
    @Column(name = "total_redeemed_cups", nullable = false) public int totalRedeemedCups;
    @Version @Column(nullable = false) public int version;
    @Column(name = "updated_at", nullable = false) public Instant updatedAt = Instant.now();
    public int getAvailableRewards() { return Math.max(currentStamps, 0) / 10; }
}
