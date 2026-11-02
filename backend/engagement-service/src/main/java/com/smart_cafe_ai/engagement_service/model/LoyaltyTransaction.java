package com.smart_cafe_ai.engagement_service.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.persistence.*;
import org.hibernate.annotations.Check;
import org.hibernate.annotations.GeneratedColumn;
import java.time.Instant;
import static com.smart_cafe_ai.engagement_service.model.Types.*;

@Entity @Table(name = "Loyalty_Transactions")
@Check(constraints = "(transaction_type = 'Earn' and order_id is not null and stamps between 1 and 50 and reversal_of_id is null) or (transaction_type = 'Redeem' and order_id is not null and stamps = -10 and reversal_of_id is null) or (transaction_type = 'Reversal' and reversal_of_id is not null and stamps <> 0) or (transaction_type = 'Adjustment' and stamps <> 0 and created_by is not null and note is not null)")
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class LoyaltyTransaction {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @JsonIgnore @Column(name = "idempotency_key", unique = true, length = 64) public String idempotencyKey;
    @Column(name = "user_id", nullable = false, length = 36) public String userId;
    @Column(name = "order_id") public Long orderId;
    @Enumerated(EnumType.STRING) @Column(name = "transaction_type", nullable = false) public TransactionType transactionType;
    @Column(nullable = false) public int stamps;
    @Column(name = "balance_after", nullable = false) public int balanceAfter;
    @Column(name = "reversal_of_id", unique = true) public Long reversalOfId;
    @Column(length = 255) public String note;
    @Column(name = "created_by", length = 36) public String createdBy;
    @Column(name = "created_at", nullable = false) public Instant createdAt = Instant.now();
    @JsonIgnore @Column(name = "earn_order_id", unique = true, insertable = false, updatable = false)
    @GeneratedColumn("case when transaction_type = 'Earn' then order_id else null end") public Long earnOrderId;
    @JsonIgnore @Column(name = "redeem_order_id", unique = true, insertable = false, updatable = false)
    @GeneratedColumn("case when transaction_type = 'Redeem' then order_id else null end") public Long redeemOrderId;
}
