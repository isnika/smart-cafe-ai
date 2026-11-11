package com.smart_cafe_ai.store_service.dto.timekeeping;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TimekeepingCheckOutRequest {

    @NotNull(message = "schedule_id không được để trống")
    @JsonProperty("schedule_id")
    private Long scheduleId;
}
