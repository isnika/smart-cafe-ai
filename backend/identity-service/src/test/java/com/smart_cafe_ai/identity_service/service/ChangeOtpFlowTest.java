package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.dto.auth.ChangePasswordRequest;
import com.smart_cafe_ai.identity_service.dto.user.UpdateContactRequest;
import com.smart_cafe_ai.identity_service.model.OtpPurpose;
import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.model.UserStatus;
import com.smart_cafe_ai.identity_service.repository.RefreshTokenRepository;
import com.smart_cafe_ai.identity_service.repository.RoleRepository;
import com.smart_cafe_ai.identity_service.repository.UserRepository;
import com.smart_cafe_ai.identity_service.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChangeOtpFlowTest {

    @Test
    void requestsEmailChangeOtpForNewEmail() {
        UserRepository users = mock(UserRepository.class);
        OtpService otpService = mock(OtpService.class);
        UserService userService = new UserService(users, otpService, mock(CloudinaryService.class));
        User user = User.builder().id("user-1").email("old@example.com").build();
        UpdateContactRequest request = UpdateContactRequest.builder()
                .email("new@example.com")
                .build();
        when(users.findByIdForUpdate("user-1")).thenReturn(Optional.of(user));
        when(users.existsByEmail("new@example.com")).thenReturn(false);

        assertTrue(userService.requestContactOtp("user-1", request).isSuccess());

        verify(otpService).requestContactChangeOtp(
                "new@example.com", OtpPurpose.Change_Email, "user-1", "new@example.com");
    }

    @Test
    void requestsEmailChangeOtpForNewValueWhenCurrentAndNewEmailAreProvided() {
        UserRepository users = mock(UserRepository.class);
        OtpService otpService = mock(OtpService.class);
        UserService userService = new UserService(users, otpService, mock(CloudinaryService.class));
        User user = User.builder().id("user-1").email("old@example.com").build();
        UpdateContactRequest request = UpdateContactRequest.builder()
                .email("old@example.com")
                .newEmail("new@example.com")
                .build();
        when(users.findByIdForUpdate("user-1")).thenReturn(Optional.of(user));
        when(users.existsByEmail("new@example.com")).thenReturn(false);

        assertTrue(userService.requestContactOtp("user-1", request).isSuccess());

        verify(otpService).requestContactChangeOtp(
                "new@example.com", OtpPurpose.Change_Email, "user-1", "new@example.com");
    }

    @Test
    void updatesEmailFromCurrentValueToNewValueAfterOtpVerification() {
        UserRepository users = mock(UserRepository.class);
        OtpService otpService = mock(OtpService.class);
        User user = User.builder().id("user-1").email("old@example.com").build();
        UserService userService = new UserService(users, otpService, mock(CloudinaryService.class));
        UpdateContactRequest request = UpdateContactRequest.builder()
                .email("old@example.com")
                .newEmail("new@example.com")
                .otpCode("123456")
                .build();
        when(users.findByIdForUpdate("user-1")).thenReturn(Optional.of(user));
        when(users.existsByEmail("new@example.com")).thenReturn(false);
        when(otpService.verifyOtp(
                "new@example.com", "123456", OtpPurpose.Change_Email, "user-1"))
                .thenReturn(true);
        when(users.saveAndFlush(user)).thenReturn(user);

        assertTrue(userService.updateContact("user-1", request).isSuccess());

        assertEquals("new@example.com", user.getEmail());
        verify(otpService).verifyOtp(
                "new@example.com", "123456", OtpPurpose.Change_Email, "user-1");
    }

    @Test
    void updatesPhoneFromCurrentValueToNewValueAfterOtpVerification() {
        UserRepository users = mock(UserRepository.class);
        OtpService otpService = mock(OtpService.class);
        User user = User.builder().id("user-1").phone("0900000000").email("old@example.com")
                .emailVerifiedAt(LocalDateTime.now()).build();
        UserService userService = new UserService(users, otpService, mock(CloudinaryService.class));
        UpdateContactRequest request = UpdateContactRequest.builder()
                .phone("0900000000")
                .newPhone("0911111111")
                .otpCode("123456")
                .build();
        when(users.findByIdForUpdate("user-1")).thenReturn(Optional.of(user));
        when(users.existsByPhone("0911111111")).thenReturn(false);
        when(otpService.verifyOtp(
                "0911111111", "123456", OtpPurpose.Change_Phone, "user-1"))
                .thenReturn(true);
        when(users.saveAndFlush(user)).thenReturn(user);

        assertTrue(userService.updateContact("user-1", request).isSuccess());

        assertEquals("0911111111", user.getPhone());
        verify(otpService).verifyOtp(
                "0911111111", "123456", OtpPurpose.Change_Phone, "user-1");
    }

    @Test
    void changesPasswordWithCurrentPasswordWithoutRequestingOrVerifyingOtp() {
        UserRepository users = mock(UserRepository.class);
        OtpService otpService = mock(OtpService.class);
        PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
        RefreshTokenRepository refreshTokens = mock(RefreshTokenRepository.class);
        AuthService authService = new AuthService(
                users,
                mock(RoleRepository.class),
                refreshTokens,
                passwordEncoder,
                mock(JwtService.class),
                otpService, mock(GoogleTokenVerifierService.class));
        User user = User.builder()
                .id("user-1")
                .email("user@example.com")
                .emailVerifiedAt(LocalDateTime.now())
                .passwordHash("old-hash")
                .status(UserStatus.Active)
                .build();
        when(users.findByIdForUpdate("user-1")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("old-password", "old-hash")).thenReturn(true);
        when(passwordEncoder.encode("NewPassword123!")).thenReturn("new-hash");

        ChangePasswordRequest request = ChangePasswordRequest.builder()
                .currentPassword("old-password")
                .newPassword("NewPassword123!")
                .build();
        assertTrue(authService.changePassword("user-1", request).isSuccess());
        assertEquals("new-hash", user.getPasswordHash());
        verify(refreshTokens).revokeAllByUserId("user-1");
        verify(otpService).invalidatePasswordResetOtps("user-1");
        org.mockito.Mockito.verifyNoMoreInteractions(otpService);
    }
}
