package com.smart_cafe_ai.engagement_service.model;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.persistence.*;
import org.hibernate.annotations.Check;
import java.math.BigDecimal;
import java.time.Instant;
import static com.smart_cafe_ai.engagement_service.model.Types.*;

@Entity @Table(name = "Vouchers")
@Check(constraints = "ends_at > starts_at and min_order_amount >= 0 and usage_limit_per_user >= 1 and (usage_limit_total is null or used_count <= usage_limit_total) and ((discount_type = 'Percent' and discount_value between 1 and 100) or (discount_type = 'Fixed' and discount_value > 0))")
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class Voucher {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(nullable = false, unique = true, length = 50) public String code;
    @Column(nullable = false, length = 100) public String name;
    @Enumerated(EnumType.STRING) @Column(name = "discount_type", nullable = false) public DiscountType discountType;
    @Column(name = "discount_value", nullable = false, precision = 15, scale = 0) public BigDecimal discountValue;
    @Column(name = "max_discount_amount", precision = 15, scale = 0) public BigDecimal maxDiscountAmount;
    @Column(name = "min_order_amount", nullable = false, precision = 15, scale = 0) public BigDecimal minOrderAmount = BigDecimal.ZERO;
    @Column(name = "branch_id") public Integer branchId;
    @Enumerated(EnumType.STRING) @Column(name = "applicable_fulfillment", nullable = false) public Fulfillment applicableFulfillment = Fulfillment.All;
    @Column(name = "starts_at", nullable = false) public Instant startsAt;
    @Column(name = "ends_at", nullable = false) public Instant endsAt;
    @Column(name = "usage_limit_total") public Integer usageLimitTotal;
    @Column(name = "usage_limit_per_user", nullable = false) public int usageLimitPerUser = 1;
    @Column(name = "used_count", nullable = false) public int usedCount;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public VoucherStatus status = VoucherStatus.Active;
    @Column(name = "created_at", nullable = false) public Instant createdAt = Instant.now();
}
