package com.smart_cafe_ai.identity_service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StaffUpdateRequest {
    @JsonProperty("full_name")
    private String fullName;
    private String email;
    private String phone;
    private String avatar;
    @JsonProperty("branch_id")
    private Integer branchId;
}
