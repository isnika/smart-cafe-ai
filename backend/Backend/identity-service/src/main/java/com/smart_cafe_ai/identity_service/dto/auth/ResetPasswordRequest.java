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
public class ResetPasswordRequest {
    @JsonProperty("phone_email")
    private String phoneEmail;
    @JsonProperty("otp_code")
    private String otpCode;
    @JsonProperty("new_password")
    private String newPassword;
}
