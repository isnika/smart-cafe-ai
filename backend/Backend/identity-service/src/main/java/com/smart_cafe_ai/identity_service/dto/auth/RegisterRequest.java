package com.smart_cafe_ai.identity_service.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RegisterRequest {
    @JsonProperty("full_name")
    @JsonAlias({"full_name", "fullName"})
    private String fullName;

    private String email;
    private String phone;
    private String password;
}
