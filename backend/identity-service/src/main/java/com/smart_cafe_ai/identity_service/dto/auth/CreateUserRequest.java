package com.smart_cafe_ai.identity_service.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreateUserRequest {
    private String fullName;
    private String email;
    private String phone;
    private String password;
    private String roleName;
    private Integer branchId;
}
