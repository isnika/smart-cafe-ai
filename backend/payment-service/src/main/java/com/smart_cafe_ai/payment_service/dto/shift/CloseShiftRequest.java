package com.smart_cafe_ai.payment_service.dto.shift;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
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
public class CloseShiftRequest {

    @NotNull(message = "Số tiền mặt kết ca không được để trống")
    @PositiveOrZero(message = "Số tiền mặt kết ca phải lớn hơn hoặc bằng 0")
    @JsonProperty("closing_cash")
    @JsonAlias({"closingCash", "closing_cash"})
    private BigDecimal closingCash;
}
