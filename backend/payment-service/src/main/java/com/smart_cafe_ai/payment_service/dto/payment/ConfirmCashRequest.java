package com.smart_cafe_ai.payment_service.dto.payment;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ConfirmCashRequest {

    @PositiveOrZero(message = "Số tiền khách đưa phải lớn hơn hoặc bằng 0")
    @JsonProperty("cash_received")
    @JsonAlias({"cashReceived", "cash_received"})
    private BigDecimal cashReceived;

    @JsonProperty("cashier_shift_id")
    @JsonAlias({"cashierShiftId", "cashier_shift_id"})
    private Integer cashierShiftId;
}
