package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.dto.auth.RegisterRequest;
import com.smart_cafe_ai.identity_service.model.OtpPurpose;
import com.smart_cafe_ai.identity_service.model.Role;
import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.repository.RefreshTokenRepository;
import com.smart_cafe_ai.identity_service.repository.RoleRepository;
import com.smart_cafe_ai.identity_service.repository.UserRepository;
import com.smart_cafe_ai.identity_service.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RegistrationOtpChannelTest {
    @Test
    void registrationWithBothContactsPrefersEmail() {
        assertRegistrationTarget("customer@example.com", "customer@example.com");
    }

    @Test
    void registrationWithOnlyPhoneRetainsPhoneOtp() {
        assertRegistrationTarget(null, "0901234567");
    }

    private void assertRegistrationTarget(String email, String expectedTarget) {
        UserRepository users = mock(UserRepository.class);
        RoleRepository roles = mock(RoleRepository.class);
        OtpService otpService = mock(OtpService.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        Role role = Role.builder().name("Customer").build();
        when(roles.findByName("Customer")).thenReturn(Optional.of(role));
        when(encoder.encode("Password123!")).thenReturn("hashed-password");
        when(users.save(any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            user.setId("user-1");
            return user;
        });
        AuthService auth = new AuthService(users, roles, mock(RefreshTokenRepository.class),
                encoder, mock(JwtService.class), otpService);
        RegisterRequest request = RegisterRequest.builder().fullName("Customer")
                .email(email).phone("0901234567").password("Password123!").build();

        assertTrue(auth.register(request).isSuccess());
        verify(otpService).generateAndSaveOtp(expectedTarget, OtpPurpose.Register, "user-1", null);
    }
}
