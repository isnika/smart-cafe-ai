package com.smart_cafe_ai.payment_service.dto.shift;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.smart_cafe_ai.payment_service.enums.CashierShiftStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CashierShiftResponse {

    private Integer id;
    private Integer branchId;
    private String registerCode;
    private String staffUserId;
    private LocalDateTime openingTime;
    private LocalDateTime closingTime;
    private BigDecimal openingCash;
    private Integer totalOrders;
    private BigDecimal totalCashSales;
    private BigDecimal totalOnlineSales;
    private BigDecimal totalCashRefunds;
    private BigDecimal totalCashIn;
    private BigDecimal totalCashOut;
    private BigDecimal expectedCash;
    private BigDecimal closingCash;
    private BigDecimal discrepancy;
    private CashierShiftStatus status;
}
