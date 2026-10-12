package com.smart_cafe_ai.identity_service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.identity_service.model.UserStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AdminUserCreateRequest {
    @JsonProperty("full_name")
    private String fullName;
    private String email;
    private String phone;
    private String password;
    @JsonProperty("role_id")
    private Integer roleId;
    @JsonProperty("branch_id")
    private Integer branchId;
    private UserStatus status;
}
