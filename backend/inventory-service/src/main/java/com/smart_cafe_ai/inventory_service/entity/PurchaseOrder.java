package com.smart_cafe_ai.inventory_service.entity;

import com.smart_cafe_ai.inventory_service.enums.PurchaseOrderStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "Purchase_Orders")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PurchaseOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "branch_id", nullable = false)
    private Integer branchId;

    @Column(name = "supplier_id", nullable = false)
    private Integer supplierId;

    @Column(name = "total_amount", precision = 10, scale = 2)
    private BigDecimal totalAmount;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private PurchaseOrderStatus status;

    @Column(name = "created_by", nullable = false, length = 36)
    @Builder.Default
    private String createdBy = "system";

    @Column(name = "approved_by", length = 36)
    private String approvedBy;

    @Column(name = "ordered_at")
    private LocalDateTime orderedAt;

    @Column(name = "expected_at")
    private LocalDateTime expectedAt;

    @Column(name = "received_at")
    private LocalDateTime receivedAt;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @OneToMany(mappedBy = "purchaseOrder", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @Builder.Default
    @ToString.Exclude
    @EqualsAndHashCode.Exclude
    private List<PurchaseOrderDetail> details = new ArrayList<>();

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        if (status == null) {
            status = PurchaseOrderStatus.Draft;
        }
        if (createdBy == null || createdBy.isBlank()) {
            createdBy = "system";
        }
    }
}
