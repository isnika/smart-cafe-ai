package com.smart_cafe_ai.payment_service.entity;

import com.smart_cafe_ai.payment_service.enums.PaymentMethod;
import com.smart_cafe_ai.payment_service.enums.PaymentStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "Payments", indexes = {
        @Index(name = "idx_payments_cashier_shift", columnList = "cashier_shift_id"),
        @Index(name = "idx_payments_branch_created", columnList = "branch_id, created_at"),
        @Index(name = "idx_payments_status_created", columnList = "status, created_at"),
        @Index(name = "idx_payments_pending_expiry", columnList = "status, expires_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Payment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "branch_id", nullable = false)
    private Integer branchId;

    @Column(name = "cashier_shift_id")
    private Integer cashierShiftId;

    @Column(name = "idempotency_key", length = 64, unique = true)
    private String idempotencyKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_method", nullable = false, length = 20)
    private PaymentMethod paymentMethod;

    @Column(name = "amount", nullable = false, precision = 15, scale = 0)
    private BigDecimal amount;

    @Column(name = "refunded_amount", nullable = false, precision = 15, scale = 0)
    @Builder.Default
    private BigDecimal refundedAmount = BigDecimal.ZERO;

    @Column(name = "cash_received", precision = 15, scale = 0)
    private BigDecimal cashReceived;

    @Column(name = "change_amount", precision = 15, scale = 0)
    private BigDecimal changeAmount;

    @Column(name = "collected_by", length = 36)
    private String collectedBy;

    @Column(name = "transaction_id", length = 100, unique = true)
    private String transactionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private PaymentStatus status = PaymentStatus.Pending;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "paid_at")
    private LocalDateTime paidAt;

    @Column(name = "created_by", length = 36)
    private String createdBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "payment", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<PaymentOrderAllocation> allocations = new ArrayList<>();
}
