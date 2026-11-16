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
public class OpenShiftRequest {

    @NotNull(message = "Chi nhánh không được để trống")
    @JsonProperty("branch_id")
    @JsonAlias({"branchId", "branch_id"})
    private Integer branchId;

    @JsonProperty("register_code")
    @JsonAlias({"registerCode", "register_code"})
    private String registerCode;

    @NotNull(message = "Số tiền mặt đầu ca không được để trống")
    @PositiveOrZero(message = "Số tiền mặt đầu ca phải lớn hơn hoặc bằng 0")
    @JsonProperty("opening_cash")
    @JsonAlias({"openingCash", "opening_cash"})
    private BigDecimal openingCash;
}
