package com.smart_cafe_ai.payment_service.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "Payment_Order_Allocations",
        uniqueConstraints = @UniqueConstraint(name = "uq_payment_order_allocation", columnNames = {"payment_id", "order_id"}),
        indexes = @Index(name = "idx_payment_allocations_order", columnList = "order_id")
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentOrderAllocation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "payment_id", nullable = false)
    @JsonIgnore
    private Payment payment;

    @Column(name = "order_id", nullable = false)
    private Long orderId;

    @Column(name = "allocated_amount", nullable = false, precision = 15, scale = 0)
    private BigDecimal allocatedAmount;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
