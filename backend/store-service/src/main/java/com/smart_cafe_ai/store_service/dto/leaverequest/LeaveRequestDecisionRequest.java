package com.smart_cafe_ai.store_service.dto.leaverequest;

import com.smart_cafe_ai.store_service.enums.LeaveStatus;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LeaveRequestDecisionRequest {

    @NotNull(message = "status không được để trống (Approved hoặc Rejected)")
    private LeaveStatus status;
}
