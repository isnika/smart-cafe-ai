package com.smart_cafe_ai.identity_service.dto.event;

import java.time.Instant;

/** JSON contract v1; Engagement owns its own copy to keep the services independent. */
public record OtpEmailEvent(String eventId, String userId, String email, String otpCode,
                            String purpose, Instant expiresAt) {
    @Override
    public String toString() {
        return "OtpEmailEvent[eventId=" + eventId + ", purpose=" + purpose + "]";
    }
}
