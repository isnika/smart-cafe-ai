package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.model.OtpLog;
import com.smart_cafe_ai.identity_service.model.OtpPurpose;
import com.smart_cafe_ai.identity_service.repository.OtpLogRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import org.mockito.ArgumentCaptor;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OtpServiceTest {

    @Test
    void verifyOtpTrimsTargetAndMarksNewestOtpUsed() {
        OtpLogRepository repository = mock(OtpLogRepository.class);
        PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
        OtpService otpService = new OtpService(repository, passwordEncoder, mock(OtpEmailOutboxService.class));
        OtpLog otpLog = OtpLog.builder()
                .otpHash("hashed-otp")
                .expiresAt(LocalDateTime.now().plusMinutes(5))
                .attemptCount(0)
                .maxAttempts(5)
                .isUsed(false)
                .build();

        when(repository.findFirstByTargetAndPurposeAndIsUsedFalseOrderByIdDesc(
                "customer@example.com", OtpPurpose.Reset_Password))
                .thenReturn(Optional.of(otpLog));
        when(passwordEncoder.matches("123456", "hashed-otp")).thenReturn(true);

        assertTrue(otpService.verifyOtp(
                " customer@example.com ", "123456", OtpPurpose.Reset_Password));

        verify(repository).findFirstByTargetAndPurposeAndIsUsedFalseOrderByIdDesc(
                "customer@example.com", OtpPurpose.Reset_Password);
        assertTrue(otpLog.getIsUsed());
    }

    @Test
    void verifyEmailChangeOtpIsScopedToUserAndNormalizesEmailAndCode() {
        OtpLogRepository repository = mock(OtpLogRepository.class);
        PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
        OtpService otpService = new OtpService(repository, passwordEncoder, mock(OtpEmailOutboxService.class));
        OtpLog otpLog = OtpLog.builder()
                .otpHash("hashed-otp")
                .expiresAt(LocalDateTime.now().plusMinutes(5))
                .attemptCount(0)
                .maxAttempts(5)
                .isUsed(false)
                .build();

        when(repository.findFirstByTargetAndPurposeAndUserIdAndIsUsedFalseOrderByIdDesc(
                "new@example.com", OtpPurpose.Change_Email, "user-1"))
                .thenReturn(Optional.of(otpLog));
        when(passwordEncoder.matches("123456", "hashed-otp")).thenReturn(true);

        assertTrue(otpService.verifyOtp(
                " New@Example.com ", " 123456 ", OtpPurpose.Change_Email, "user-1"));

        verify(repository).findFirstByTargetAndPurposeAndUserIdAndIsUsedFalseOrderByIdDesc(
                "new@example.com", OtpPurpose.Change_Email, "user-1");
        assertTrue(otpLog.getIsUsed());
    }

    @Test
    void generatedEmailOtpCanBeVerifiedWithDifferentEmailCase() {
        OtpLogRepository repository = mock(OtpLogRepository.class);
        PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
        OtpService otpService = new OtpService(repository, passwordEncoder, mock(OtpEmailOutboxService.class));
        when(passwordEncoder.encode(anyString())).thenReturn("hashed-otp");
        when(passwordEncoder.matches(anyString(), eq("hashed-otp"))).thenReturn(true);

        String otp = otpService.generateAndSaveOtp(
                "New@Example.com", OtpPurpose.Change_Email, "user-1", null);

        ArgumentCaptor<OtpLog> otpLogCaptor = ArgumentCaptor.forClass(OtpLog.class);
        verify(repository).save(otpLogCaptor.capture());
        OtpLog savedOtp = otpLogCaptor.getValue();
        assertEquals("new@example.com", savedOtp.getTarget());
        when(repository.findFirstByTargetAndPurposeAndUserIdAndIsUsedFalseOrderByIdDesc(
                "new@example.com", OtpPurpose.Change_Email, "user-1"))
                .thenReturn(Optional.of(savedOtp));

        assertTrue(otpService.verifyOtp(
                "new@example.com", otp, OtpPurpose.Change_Email, "user-1"));
    }
}
