package com.smart_cafe_ai.store_service.dto.timekeeping;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TimekeepingAdjustmentRequest {

    @JsonProperty("check_in")
    private LocalDateTime checkIn;

    @JsonProperty("check_out")
    private LocalDateTime checkOut;

    @NotBlank(message = "Lý do điều chỉnh không được để trống")
    @JsonProperty("adjustment_reason")
    private String adjustmentReason;
}
