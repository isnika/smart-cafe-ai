package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.model.OtpChannel;
import com.smart_cafe_ai.identity_service.model.OtpLog;
import com.smart_cafe_ai.identity_service.model.OtpPurpose;
import com.smart_cafe_ai.identity_service.repository.OtpLogRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Locale;

@Service
public class OtpService {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(OtpService.class);
    private final OtpLogRepository otpLogRepository;
    private final PasswordEncoder passwordEncoder;
    private static final SecureRandom random = new SecureRandom();

    public OtpService(OtpLogRepository otpLogRepository, PasswordEncoder passwordEncoder) {
        this.otpLogRepository = otpLogRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public String generateAndSaveOtp(String target, OtpPurpose purpose) {
        return generateAndSaveOtp(target, purpose, null, null);
    }

    @Transactional
    public String generateAndSaveOtp(String target, OtpPurpose purpose, String userId, String ipAddress) {
        String normalizedTarget = normalizeTarget(target);
        String otpCode = String.format("%06d", random.nextInt(1000000));
        String otpHash = passwordEncoder.encode(otpCode);
        OtpChannel channel = (normalizedTarget != null && normalizedTarget.contains("@")) ? OtpChannel.Email : OtpChannel.Phone;
        OtpLog otpLog =  // 5 phút TTL
        OtpLog.builder().userId(userId).channel(channel).target(normalizedTarget).otpHash(otpHash).purpose(purpose).expiresAt(LocalDateTime.now().plusMinutes(5)).attemptCount(0).maxAttempts(5).isUsed(false).ipAddress(ipAddress).build();
        otpLogRepository.save(otpLog);
        log.info("\ud83d\udd11 [OTP DEV LOG] Mã OTP sinh ra cho {}: {}", normalizedTarget, otpCode);
        System.out.println("=================================================");
        System.out.println("\ud83d\udd11 [OTP CODE] MÃ OTP CỦA " + normalizedTarget + " LÀ: " + otpCode);
        System.out.println("=================================================");
        return otpCode;
    }

    @Transactional
    public boolean verifyOtp(String target, String otpCode, OtpPurpose purpose) {
        return verifyOtp(target, otpCode, purpose, null);
    }

    @Transactional
    public boolean verifyOtp(String target, String otpCode, OtpPurpose purpose, String userId) {
        String normalizedOtpCode = otpCode == null ? null : otpCode.trim();
        if (target == null || target.isBlank() || normalizedOtpCode == null || !normalizedOtpCode.matches("\\d{6}") || purpose == null) {
            return false;
        }
        String normalizedTarget = normalizeTarget(target);
        log.info("Verifying OTP: target=\'{}\', purpose={}, currentTime={}", normalizedTarget, purpose, LocalDateTime.now());
        OtpLog otpLog = (userId == null ? otpLogRepository.findFirstByTargetAndPurposeAndIsUsedFalseOrderByIdDesc(normalizedTarget, purpose) : otpLogRepository.findFirstByTargetAndPurposeAndUserIdAndIsUsedFalseOrderByIdDesc(normalizedTarget, purpose, userId)).orElse(null);
        if (otpLog == null) {
            log.warn("OTP verification failed: no active OTP for target=\'{}\', purpose={}", normalizedTarget, purpose);
            return false;
        }
        if (otpLog.getExpiresAt() == null || !otpLog.getExpiresAt().isAfter(LocalDateTime.now())) {
            return false;
        }
        if (otpLog.getAttemptCount() >= otpLog.getMaxAttempts()) {
            return false;
        }
        otpLog.setAttemptCount(otpLog.getAttemptCount() + 1);
        boolean valid = passwordEncoder.matches(normalizedOtpCode, otpLog.getOtpHash());
        if (valid) {
            otpLog.setIsUsed(true);
            otpLog.setUsedAt(LocalDateTime.now());
        }
        otpLogRepository.save(otpLog);
        return valid;
    }

    private String normalizeTarget(String target) {
        if (target == null) {
            return null;
        }
        String normalizedTarget = target.trim();
        return normalizedTarget.contains("@") ? normalizedTarget.toLowerCase(Locale.ROOT) : normalizedTarget;
    }
}

