package com.smart_cafe_ai.store_service.dto.schedule;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ScheduleRequest {

    @NotNull(message = "staff_id không được để trống")
    @JsonProperty("staff_id")
    private Long staffId;

    @NotNull(message = "shift_id không được để trống")
    @JsonProperty("shift_id")
    private Integer shiftId;

    @NotNull(message = "work_date không được để trống")
    @JsonProperty("work_date")
    private LocalDate workDate;
}
