package com.smart_cafe_ai.payment_service.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "Refund_Order_Allocations",
        uniqueConstraints = @UniqueConstraint(name = "uq_refund_order_allocation", columnNames = {"refund_id", "order_id"}),
        indexes = @Index(name = "idx_refund_allocations_order", columnList = "order_id")
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RefundOrderAllocation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "refund_id", nullable = false)
    @JsonIgnore
    private Refund refund;

    @Column(name = "order_id", nullable = false)
    private Long orderId;

    @Column(name = "amount", nullable = false, precision = 15, scale = 0)
    private BigDecimal amount;

    @Column(name = "restock_inventory", nullable = false)
    @Builder.Default
    private Boolean restockInventory = false;

    @Column(name = "reverse_loyalty", nullable = false)
    @Builder.Default
    private Boolean reverseLoyalty = true;
}
