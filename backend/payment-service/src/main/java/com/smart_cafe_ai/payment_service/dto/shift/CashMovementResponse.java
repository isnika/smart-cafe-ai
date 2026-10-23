package com.smart_cafe_ai.payment_service.dto.shift;

import com.smart_cafe_ai.payment_service.enums.CashMovementType;
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
public class CashMovementResponse {

    private Long id;
    private Integer cashierShiftId;
    private CashMovementType movementType;
    private BigDecimal amount;
    private String reason;
    private String createdBy;
    private LocalDateTime createdAt;
}
