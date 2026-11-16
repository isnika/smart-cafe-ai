package com.smart_cafe_ai.engagement_service.model;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.persistence.*;
import org.hibernate.annotations.Check;
import java.math.BigDecimal;
import java.time.Instant;
import static com.smart_cafe_ai.engagement_service.model.Types.*;

@Entity @Table(name = "Voucher_Redemptions", uniqueConstraints = @UniqueConstraint(columnNames = {"voucher_id", "order_id"}))
@Check(constraints = "discount_amount > 0")
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class VoucherRedemption {
    @com.fasterxml.jackson.annotation.JsonIgnore
    @Column(name = "request_hash", length = 64) public String requestHash;
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "voucher_id", nullable = false) public Long voucherId;
    @Column(name = "user_id", nullable = false, length = 36) public String userId;
    @Column(name = "order_id", nullable = false) public Long orderId;
    @Column(name = "discount_amount", nullable = false, precision = 15, scale = 0) public BigDecimal discountAmount;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public RedemptionStatus status = RedemptionStatus.Applied;
    @Column(name = "created_at", nullable = false) public Instant createdAt = Instant.now();
}
