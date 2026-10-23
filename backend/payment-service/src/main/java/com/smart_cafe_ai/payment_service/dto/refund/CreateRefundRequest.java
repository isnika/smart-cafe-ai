package com.smart_cafe_ai.payment_service.dto.refund;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.payment_service.enums.RefundMethod;
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
public class CreateRefundRequest {

    @NotNull(message = "Mã thanh toán không được để trống")
    @JsonProperty("payment_id")
    @JsonAlias({"paymentId", "payment_id"})
    private Long paymentId;

    @NotNull(message = "Số tiền hoàn không được để trống")
    @Positive(message = "Số tiền hoàn phải lớn hơn 0")
    private BigDecimal amount;

    @JsonProperty("refund_method")
    @JsonAlias({"refundMethod", "refund_method"})
    private RefundMethod refundMethod;

    @NotBlank(message = "Lý do hoàn tiền không được để trống")
    private String reason;
}
