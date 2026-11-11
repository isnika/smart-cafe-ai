package com.smart_cafe_ai.inventory_service.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "PO_Details")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PurchaseOrderDetail {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "po_id", nullable = false)
    @ToString.Exclude
    @EqualsAndHashCode.Exclude
    private PurchaseOrder purchaseOrder;

    @Column(name = "ingredient_id", nullable = false)
    private Integer ingredientId;

    @Column(name = "purchase_unit", nullable = false, length = 20)
    @Builder.Default
    private String purchaseUnit = "unit";

    @Column(name = "conversion_factor", nullable = false, precision = 14, scale = 4)
    @Builder.Default
    private BigDecimal conversionFactor = BigDecimal.ONE;

    @Column(name = "quantity", nullable = false, precision = 10, scale = 3)
    private BigDecimal quantity;

    @Column(name = "received_quantity", nullable = false, precision = 14, scale = 3)
    @Builder.Default
    private BigDecimal receivedQuantity = BigDecimal.ZERO;

    @Column(name = "unit_price", nullable = false, precision = 10, scale = 2)
    private BigDecimal unitPrice;
}
