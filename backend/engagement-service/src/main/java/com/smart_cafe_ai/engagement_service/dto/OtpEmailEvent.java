package com.smart_cafe_ai.engagement_service.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;

/** JSON contract v1, independent of Identity's Java package. */
public record OtpEmailEvent(
        @NotBlank @Size(max = 36) String eventId,
        @Size(max = 36) String userId,
        @NotBlank @Email @Size(max = 255) String email,
        @NotBlank @Pattern(regexp = "[0-9]{6}") String otpCode,
        @NotBlank @Pattern(regexp = "Register|Reset_Password|Change_Password|Change_Email") String purpose,
        @NotNull Instant expiresAt) {
    @Override
    public String toString() {
        return "OtpEmailEvent[eventId=" + eventId + ", purpose=" + purpose + "]";
    }
}
