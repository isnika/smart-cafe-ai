package com.smart_cafe_ai.inventory_service.entity;

import com.smart_cafe_ai.inventory_service.enums.TransactionType;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "Inventory_Logs")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InventoryLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "branch_id", nullable = false)
    private Integer branchId;

    @Column(name = "ingredient_id", nullable = false)
    private Integer ingredientId;

    @Enumerated(EnumType.STRING)
    @Column(name = "transaction_type", nullable = false, length = 30)
    private TransactionType transactionType;

    @Column(name = "quantity_changed", nullable = false, precision = 10, scale = 3)
    private BigDecimal quantityChanged;

    @Column(name = "balance_after", nullable = false, precision = 14, scale = 3)
    @Builder.Default
    private BigDecimal balanceAfter = BigDecimal.ZERO;

    @Column(name = "reference_type", length = 50)
    private String referenceType;

    @Column(name = "reference_id", length = 64)
    private String referenceId;

    @Column(name = "reason", length = 255)
    private String reason;

    @Column(name = "created_by", length = 36)
    private String createdBy;

    @Column(name = "idempotency_key", length = 100)
    private String idempotencyKey;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
