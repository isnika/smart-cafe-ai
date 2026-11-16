package com.smart_cafe_ai.payment_service.dto.payment;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.smart_cafe_ai.payment_service.enums.PaymentMethod;
import com.smart_cafe_ai.payment_service.enums.PaymentStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PaymentResponse {

    private Long id;
    private Long orderId;
    private Long tableSessionId;
    private Integer branchId;
    private Integer cashierShiftId;
    private PaymentMethod paymentMethod;
    private BigDecimal amount;
    private BigDecimal refundedAmount;
    private BigDecimal cashReceived;
    private BigDecimal changeAmount;
    private String collectedBy;
    private String transactionId;
    private PaymentStatus status;
    private String paymentUrl;
    private List<Long> allocatedOrderIds;
    private LocalDateTime expiresAt;
    private LocalDateTime paidAt;
    private LocalDateTime createdAt;
}
