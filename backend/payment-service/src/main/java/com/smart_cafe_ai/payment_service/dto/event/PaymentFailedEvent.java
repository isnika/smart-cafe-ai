package com.smart_cafe_ai.payment_service.dto.event;

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
public class PaymentFailedEvent {
    private String eventId;
    private Long paymentId;
    private List<Long> orderIds;
    private String reason;
    private LocalDateTime failedAt;
}
