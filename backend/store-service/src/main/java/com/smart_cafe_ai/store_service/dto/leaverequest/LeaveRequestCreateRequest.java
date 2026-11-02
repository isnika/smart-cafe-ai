package com.smart_cafe_ai.store_service.dto.leaverequest;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.store_service.enums.LeaveType;
import jakarta.validation.constraints.NotBlank;
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
public class LeaveRequestCreateRequest {

    @JsonProperty("leave_type")
    @Builder.Default
    private LeaveType leaveType = LeaveType.Annual;

    @NotNull(message = "start_date không được để trống")
    @JsonProperty("start_date")
    private LocalDate startDate;

    @NotNull(message = "end_date không được để trống")
    @JsonProperty("end_date")
    private LocalDate endDate;

    @NotBlank(message = "Lý do nghỉ không được để trống")
    private String reason;
}
