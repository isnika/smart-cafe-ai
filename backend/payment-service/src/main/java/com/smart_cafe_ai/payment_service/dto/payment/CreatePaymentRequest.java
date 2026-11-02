package com.smart_cafe_ai.payment_service.dto.payment;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.payment_service.enums.PaymentMethod;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreatePaymentRequest {

    @JsonProperty("order_id")
    @JsonAlias({"orderId", "order_id"})
    private Long orderId;

    @JsonProperty("table_session_id")
    @JsonAlias({"tableSessionId", "table_session_id"})
    private Long tableSessionId;

    @JsonProperty("branch_id")
    @JsonAlias({"branchId", "branch_id"})
    private Integer branchId;

    @NotNull(message = "Phương thức thanh toán không được để trống")
    @JsonProperty("payment_method")
    @JsonAlias({"paymentMethod", "payment_method"})
    private PaymentMethod paymentMethod;

    @JsonProperty("return_url")
    @JsonAlias({"returnUrl", "return_url"})
    private String returnUrl;

    @JsonProperty("idempotency_key")
    @JsonAlias({"idempotencyKey", "idempotency_key"})
    private String idempotencyKey;
}
