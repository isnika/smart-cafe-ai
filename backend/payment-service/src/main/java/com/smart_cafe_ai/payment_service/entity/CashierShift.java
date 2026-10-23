package com.smart_cafe_ai.payment_service.entity;

import com.smart_cafe_ai.payment_service.enums.CashierShiftStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "Cashier_Shifts", indexes = {
        @Index(name = "idx_cashier_shift_branch_status", columnList = "branch_id, status"),
        @Index(name = "idx_cashier_shift_staff", columnList = "staff_user_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CashierShift {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "branch_id", nullable = false)
    private Integer branchId;

    @Column(name = "register_code", nullable = false, length = 20)
    @Builder.Default
    private String registerCode = "MAIN";

    @Column(name = "staff_user_id", nullable = false, length = 36)
    private String staffUserId;

    @Column(name = "opening_time", nullable = false)
    @Builder.Default
    private LocalDateTime openingTime = LocalDateTime.now();

    @Column(name = "closing_time")
    private LocalDateTime closingTime;

    @Column(name = "opening_cash", nullable = false, precision = 15, scale = 0)
    @Builder.Default
    private BigDecimal openingCash = BigDecimal.ZERO;

    @Column(name = "total_orders", nullable = false)
    @Builder.Default
    private Integer totalOrders = 0;

    @Column(name = "total_cash_sales", nullable = false, precision = 15, scale = 0)
    @Builder.Default
    private BigDecimal totalCashSales = BigDecimal.ZERO;

    @Column(name = "total_online_sales", nullable = false, precision = 15, scale = 0)
    @Builder.Default
    private BigDecimal totalOnlineSales = BigDecimal.ZERO;

    @Column(name = "total_cash_refunds", nullable = false, precision = 15, scale = 0)
    @Builder.Default
    private BigDecimal totalCashRefunds = BigDecimal.ZERO;

    @Column(name = "total_cash_in", nullable = false, precision = 15, scale = 0)
    @Builder.Default
    private BigDecimal totalCashIn = BigDecimal.ZERO;

    @Column(name = "total_cash_out", nullable = false, precision = 15, scale = 0)
    @Builder.Default
    private BigDecimal totalCashOut = BigDecimal.ZERO;

    @Column(name = "expected_cash", precision = 15, scale = 0)
    private BigDecimal expectedCash;

    @Column(name = "closing_cash", precision = 15, scale = 0)
    private BigDecimal closingCash;

    @Column(name = "discrepancy", precision = 15, scale = 0, insertable = false, updatable = false)
    private BigDecimal discrepancy;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private CashierShiftStatus status = CashierShiftStatus.Open;
}
