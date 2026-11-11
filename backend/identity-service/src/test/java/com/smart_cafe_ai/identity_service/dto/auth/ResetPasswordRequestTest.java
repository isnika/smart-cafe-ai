package com.smart_cafe_ai.identity_service.dto.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ResetPasswordRequestTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void acceptsCamelCasePayload() throws Exception {
        ResetPasswordRequest request = objectMapper.readValue("""
                {
                  "phoneEmail": "tam@gmail.com",
                  "otpCode": "749563",
                  "newPassword": "1234567"
                }
                """, ResetPasswordRequest.class);

        assertEquals("tam@gmail.com", request.getPhoneEmail());
        assertEquals("749563", request.getOtpCode());
        assertEquals("1234567", request.getNewPassword());
    }

    @Test
    void acceptsSnakeCasePayload() throws Exception {
        ResetPasswordRequest request = objectMapper.readValue("""
                {
                  "phone_email": "tam@gmail.com",
                  "otp_code": "749563",
                  "new_password": "1234567"
                }
                """, ResetPasswordRequest.class);

        assertEquals("tam@gmail.com", request.getPhoneEmail());
        assertEquals("749563", request.getOtpCode());
        assertEquals("1234567", request.getNewPassword());
    }
}
