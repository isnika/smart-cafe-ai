package com.smart_cafe_ai.payment_service.dto.refund;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.smart_cafe_ai.payment_service.enums.RefundMethod;
import com.smart_cafe_ai.payment_service.enums.RefundStatus;
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
public class RefundResponse {

    private Long id;
    private Long paymentId;
    private RefundMethod refundMethod;
    private Integer cashierShiftId;
    private BigDecimal amount;
    private String reason;
    private RefundStatus status;
    private String requestedBy;
    private String approvedBy;
    private String processedBy;
    private LocalDateTime processedAt;
    private String refundTransactionId;
    private LocalDateTime createdAt;
}
