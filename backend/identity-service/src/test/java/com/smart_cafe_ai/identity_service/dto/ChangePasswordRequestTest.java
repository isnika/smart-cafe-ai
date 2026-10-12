package com.smart_cafe_ai.identity_service.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ChangePasswordRequestTest {

    @Test
    void acceptsCamelCaseRequestFields() throws Exception {
        ChangePasswordRequest request = new ObjectMapper().readValue("""
                {
                  "currentPassword": "old-password",
                  "newPassword": "new-password",
                  "otpCode": "123456"
                }
                """, ChangePasswordRequest.class);

        assertEquals("old-password", request.getCurrentPassword());
        assertEquals("new-password", request.getNewPassword());
        assertEquals("123456", request.getOtpCode());
    }
}
