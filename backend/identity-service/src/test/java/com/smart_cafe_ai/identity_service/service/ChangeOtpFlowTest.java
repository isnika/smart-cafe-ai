package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.dto.auth.ChangePasswordRequest;
import com.smart_cafe_ai.identity_service.dto.user.UpdateContactRequest;
import com.smart_cafe_ai.identity_service.model.OtpPurpose;
import com.smart_cafe_ai.identity_service.model.User;
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
        when(users.findById("user-1")).thenReturn(Optional.of(user));
        when(users.existsByEmail("new@example.com")).thenReturn(false);

        assertTrue(userService.requestContactOtp("user-1", request).isSuccess());

        verify(otpService).generateAndSaveOtp(
                "new@example.com", OtpPurpose.Change_Email, "user-1", null);
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
        when(users.findById("user-1")).thenReturn(Optional.of(user));
        when(users.existsByEmail("new@example.com")).thenReturn(false);

        assertTrue(userService.requestContactOtp("user-1", request).isSuccess());

        verify(otpService).generateAndSaveOtp(
                "new@example.com", OtpPurpose.Change_Email, "user-1", null);
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
        when(users.findById("user-1")).thenReturn(Optional.of(user));
        when(users.existsByEmail("new@example.com")).thenReturn(false);
        when(otpService.verifyOtp(
                "new@example.com", "123456", OtpPurpose.Change_Email, "user-1"))
                .thenReturn(true);
        when(users.save(user)).thenReturn(user);

        assertTrue(userService.updateContact("user-1", request).isSuccess());

        assertEquals("new@example.com", user.getEmail());
        verify(otpService).verifyOtp(
                "new@example.com", "123456", OtpPurpose.Change_Email, "user-1");
    }

    @Test
    void updatesPhoneFromCurrentValueToNewValueAfterOtpVerification() {
        UserRepository users = mock(UserRepository.class);
        OtpService otpService = mock(OtpService.class);
        User user = User.builder().id("user-1").phone("0900000000").build();
        UserService userService = new UserService(users, otpService, mock(CloudinaryService.class));
        UpdateContactRequest request = UpdateContactRequest.builder()
                .phone("0900000000")
                .newPhone("0911111111")
                .otpCode("123456")
                .build();
        when(users.findById("user-1")).thenReturn(Optional.of(user));
        when(users.existsByPhone("0911111111")).thenReturn(false);
        when(otpService.verifyOtp(
                "0911111111", "123456", OtpPurpose.Change_Phone, "user-1"))
                .thenReturn(true);
        when(users.save(user)).thenReturn(user);

        assertTrue(userService.updateContact("user-1", request).isSuccess());

        assertEquals("0911111111", user.getPhone());
        verify(otpService).verifyOtp(
                "0911111111", "123456", OtpPurpose.Change_Phone, "user-1");
    }

    @Test
    void requestsAndRequiresChangePasswordOtpForVerifiedEmail() {
        UserRepository users = mock(UserRepository.class);
        OtpService otpService = mock(OtpService.class);
        PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
        AuthService authService = new AuthService(
                users,
                mock(RoleRepository.class),
                mock(RefreshTokenRepository.class),
                passwordEncoder,
                mock(JwtService.class),
                otpService);
        User user = User.builder()
                .id("user-1")
                .email("user@example.com")
                .emailVerifiedAt(LocalDateTime.now())
                .passwordHash("old-hash")
                .build();
        when(users.findById("user-1")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("old-password", "old-hash")).thenReturn(true);
        when(otpService.verifyOtp("user@example.com", "123456", OtpPurpose.Change_Password))
                .thenReturn(true);
        when(passwordEncoder.encode("new-password")).thenReturn("new-hash");

        assertTrue(authService.requestChangePasswordOtp("user-1").isSuccess());
        verify(otpService).generateAndSaveOtp(
                "user@example.com", OtpPurpose.Change_Password, "user-1", null);

        ChangePasswordRequest request = ChangePasswordRequest.builder()
                .currentPassword("old-password")
                .newPassword("new-password")
                .otpCode("123456")
                .build();
        assertTrue(authService.changePassword("user-1", request).isSuccess());
        verify(otpService).verifyOtp(
                "user@example.com", "123456", OtpPurpose.Change_Password);
    }
}
