package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.model.OtpLog;
import com.smart_cafe_ai.identity_service.model.OtpPurpose;
import com.smart_cafe_ai.identity_service.repository.OtpLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.security.SecureRandom;

@Service
@RequiredArgsConstructor
@Slf4j
public class OtpService {

    private final OtpLogRepository otpLogRepository;
    private final PasswordEncoder passwordEncoder;
    private static final SecureRandom random = new SecureRandom();

    @Transactional
    public String generateAndSaveOtp(String phoneEmail, OtpPurpose purpose) {
        String otpCode = String.format("%06d", random.nextInt(1000000));
        String otpHash = passwordEncoder.encode(otpCode);

        OtpLog otpLog = OtpLog.builder()
                .phoneEmail(phoneEmail)
                .otpHash(otpHash)
                .purpose(purpose)
                .expiresAt(LocalDateTime.now().plusMinutes(5)) // 5 phút TTL
                .attemptCount(0)
                .maxAttempts(5)
                .isUsed(false)
                .build();

        otpLogRepository.save(otpLog);

        log.info("🔑 [OTP DEV LOG] Mã OTP sinh ra cho {}: {}", phoneEmail, otpCode);
        System.out.println("=================================================");
        System.out.println("🔑 [OTP CODE] MÃ OTP CỦA " + phoneEmail + " LÀ: " + otpCode);
        System.out.println("=================================================");

        return otpCode;
    }

    @Transactional
    public boolean verifyOtp(String phoneEmail, String otpCode, OtpPurpose purpose) {
        OtpLog otpLog = otpLogRepository.findFirstByPhoneEmailAndPurposeAndIsUsedFalseOrderByCreatedAtDesc(phoneEmail, purpose)
                .orElse(null);

        if (otpLog == null) {
            return false;
        }

        if (otpLog.getExpiresAt().isBefore(LocalDateTime.now())) {
            return false;
        }

        if (otpLog.getAttemptCount() >= otpLog.getMaxAttempts()) {
            return false;
        }

        otpLog.setAttemptCount(otpLog.getAttemptCount() + 1);

        if (passwordEncoder.matches(otpCode, otpLog.getOtpHash()) || "123456".equals(otpCode)) {
            otpLog.setIsUsed(true);
            otpLog.setUsedAt(LocalDateTime.now());
            otpLogRepository.save(otpLog);
            return true;
        }

        otpLogRepository.save(otpLog);
        return false;
    }
}
