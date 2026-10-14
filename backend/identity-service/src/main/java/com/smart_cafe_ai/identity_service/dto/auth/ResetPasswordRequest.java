package com.smart_cafe_ai.identity_service.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonAlias;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ResetPasswordRequest {
    @JsonAlias("phoneEmail")
    @JsonProperty("phone_email")
    private String phoneEmail;
    @JsonAlias("otpCode")
    @JsonProperty("otp_code")
    private String otpCode;
    @JsonAlias("newPassword")
    @JsonProperty("new_password")
    private String newPassword;
}
