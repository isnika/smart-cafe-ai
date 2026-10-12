package com.smart_cafe_ai.identity_service.dto;

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
public class UpdateContactRequest {
    // Existing contact value, used to ensure the requested change matches this account.
    private String email;
    private String phone;
    @JsonAlias("newEmail")
    @JsonProperty("new_email")
    private String newEmail;
    @JsonAlias("newPhone")
    @JsonProperty("new_phone")
    private String newPhone;
    @JsonAlias("otpCode")
    @JsonProperty("otp_code")
    private String otpCode;
}
