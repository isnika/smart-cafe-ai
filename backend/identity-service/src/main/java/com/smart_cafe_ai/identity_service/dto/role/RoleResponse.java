package com.smart_cafe_ai.identity_service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.identity_service.model.Role;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RoleResponse {
    private Integer id;
    private String name;
    private String description;
    @JsonProperty("user_count")
    private Long userCount;

    public static RoleResponse fromEntity(Role role, Long userCount) {
        if (role == null) {
            return null;
        }
        return RoleResponse.builder()
                .id(role.getId())
                .name(role.getName())
                .description(role.getDescription())
                .userCount(userCount != null ? userCount : 0L)
                .build();
    }
}
