package com.smart_cafe_ai.payment_service.dto.shift;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.payment_service.enums.CashMovementType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CashMovementRequest {

    @NotNull(message = "Loại biến động tiền không được để trống")
    @JsonProperty("movement_type")
    @JsonAlias({"movementType", "movement_type"})
    private CashMovementType movementType;

    @NotNull(message = "Số tiền không được để trống")
    @Positive(message = "Số tiền phải lớn hơn 0")
    private BigDecimal amount;

    @NotBlank(message = "Lý do không được để trống")
    private String reason;
}
