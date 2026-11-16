package com.smart_cafe_ai.payment_service.dto.refund;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProcessRefundRequest {

    @NotBlank(message = "Hành động xử lý (APPROVE / REJECT) không được để trống")
    private String action;

    private String note;
}
