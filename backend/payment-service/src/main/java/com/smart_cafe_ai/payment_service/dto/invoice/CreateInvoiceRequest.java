package com.smart_cafe_ai.payment_service.dto.invoice;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreateInvoiceRequest {

    @NotNull(message = "Mã đơn hàng không được để trống")
    @JsonProperty("order_id")
    @JsonAlias({"orderId", "order_id"})
    private Long orderId;

    @NotBlank(message = "Tên đơn vị / cá nhân mua hàng không được để trống")
    @JsonProperty("buyer_name")
    @JsonAlias({"buyerName", "buyer_name"})
    private String buyerName;

    @JsonProperty("buyer_tax_code")
    @JsonAlias({"buyerTaxCode", "buyer_tax_code"})
    private String buyerTaxCode;

    @JsonProperty("buyer_address")
    @JsonAlias({"buyerAddress", "buyer_address"})
    private String buyerAddress;

    @Email(message = "Email nhận hóa đơn không hợp lệ")
    private String email;
}
