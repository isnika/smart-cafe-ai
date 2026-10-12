package com.smart_cafe_ai.identity_service.dto;

import com.smart_cafe_ai.identity_service.model.UserStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StaffStatusRequest {
    private UserStatus status;
}
