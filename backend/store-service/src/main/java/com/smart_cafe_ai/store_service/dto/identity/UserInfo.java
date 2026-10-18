package com.smart_cafe_ai.store_service.dto.identity;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

/**
 * DTO nhận thông tin user từ identity-service qua OpenFeign.
 */
@Data
public class UserInfo {
    private String id;

    @JsonProperty("full_name")
    private String fullName;

    private String email;
    private String phone;
    private String avatar;

    @JsonProperty("role_id")
    private Integer roleId;

    @JsonProperty("role_name")
    private String roleName;

    @JsonProperty("branch_id")
    private Integer branchId;

    private String status;
}
