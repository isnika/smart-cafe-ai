package com.smart_cafe_ai.identity_service.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.identity_service.dto.user.UpdateContactRequest;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class UpdateContactRequestTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void acceptsSnakeCaseContactChangePayload() throws Exception {
        UpdateContactRequest request = objectMapper.readValue("""
                {
                  "email": "old@example.com",
                  "new_email": "new@example.com",
                  "otp_code": "012345"
                }
                """, UpdateContactRequest.class);

        assertEquals("old@example.com", request.getEmail());
        assertEquals("new@example.com", request.getNewEmail());
        assertEquals("012345", request.getOtpCode());
    }

    @Test
    void acceptsCamelCaseContactChangePayload() throws Exception {
        UpdateContactRequest request = objectMapper.readValue("""
                {
                  "email": "old@example.com",
                  "newEmail": "new@example.com",
                  "otpCode": "012345"
                }
                """, UpdateContactRequest.class);

        assertEquals("old@example.com", request.getEmail());
        assertEquals("new@example.com", request.getNewEmail());
        assertEquals("012345", request.getOtpCode());
    }
}
