package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.model.OtpChannel;
import com.smart_cafe_ai.identity_service.model.OtpLog;
import com.smart_cafe_ai.identity_service.model.OtpPurpose;
import com.smart_cafe_ai.identity_service.repository.OtpLogRepository;
import com.smart_cafe_ai.identity_service.dto.event.OtpEmailEvent;
import com.smart_cafe_ai.identity_service.exception.OtpLockedException;
import com.smart_cafe_ai.identity_service.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.Duration;
import java.util.Locale;
import java.util.UUID;
import java.time.ZoneId;

@Service
public class OtpService {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(OtpService.class);
    private final OtpLogRepository otpLogRepository;
    private final PasswordEncoder passwordEncoder;
    private final OtpEmailOutboxService otpEmailOutboxService;
    private static final SecureRandom random = new SecureRandom();
    @Value("${app.otp.log-codes:false}")
    private boolean logCodes;
    @Value("${app.password-recovery.resend-cooldown-seconds:60}")
    private long resendCooldownSeconds = 60;
    @Value("${app.password-recovery.max-requests-per-hour:5}")
    private int maxRequestsPerHour = 5;
    @Value("${app.contact-change.resend-cooldown-seconds:60}")
    private long contactCooldownSeconds = 60;
    @Value("${app.contact-change.max-requests-per-hour:5}")
    private int contactMaxRequestsPerHour = 5;

    public OtpService(OtpLogRepository otpLogRepository, PasswordEncoder passwordEncoder,
                      OtpEmailOutboxService otpEmailOutboxService) {
        this.otpLogRepository = otpLogRepository;
        this.passwordEncoder = passwordEncoder;
        this.otpEmailOutboxService = otpEmailOutboxService;
    }

    @Transactional
    public String generateAndSaveOtp(String target, OtpPurpose purpose) {
        return generateAndSaveOtp(target, purpose, null, null);
    }

    @Transactional
    public String generateAndSaveOtp(String target, OtpPurpose purpose, String userId, String ipAddress) {
        return generateAndSaveOtp(target, purpose, userId, ipAddress, target);
    }

    @Transactional
    public String generateAndSaveOtp(String target, OtpPurpose purpose, String userId, String ipAddress, String deliveryEmail) {
        String normalizedTarget = normalizeTarget(target);
        String email = com.smart_cafe_ai.identity_service.validation.ProfileValidation.normalizeEmail(deliveryEmail);
        if (email == null) throw new ApiException(HttpStatus.BAD_REQUEST, "EMAIL_REQUIRED", "OTP chỉ được gửi qua email hợp lệ");
        if (isContactPurpose(purpose)) otpLogRepository.invalidateByUser(userId, purpose, LocalDateTime.now());
        otpLogRepository.invalidatePrevious(normalizedTarget, purpose, userId, LocalDateTime.now());
        String otpCode = String.format("%06d", random.nextInt(1000000));
        String otpHash = passwordEncoder.encode(otpCode);
        OtpChannel channel = OtpChannel.Email;
        OtpLog otpLog =  // 5 phút TTL
        OtpLog.builder().userId(userId).channel(channel).target(normalizedTarget).otpHash(otpHash).purpose(purpose).expiresAt(LocalDateTime.now().plusMinutes(5)).attemptCount(0).maxAttempts(5).isUsed(false).ipAddress(ipAddress).build();
        otpLogRepository.save(otpLog);
        if (channel == OtpChannel.Email) {
            otpEmailOutboxService.enqueue(new OtpEmailEvent(
                    UUID.randomUUID().toString(), userId, email, otpCode,
                    purpose.name(), otpLog.getExpiresAt().atZone(ZoneId.systemDefault()).toInstant()));
        }
        if (logCodes) {
            log.warn("[DEV ONLY] OTP for {}: {}", normalizedTarget, otpCode);
        }
        return otpCode;
    }

    // UserService holds the user's existing DB lock, including when the destination changes.
    @Transactional
    public void requestContactChangeOtp(String target, OtpPurpose purpose, String userId, String deliveryEmail) {
        LocalDateTime now = LocalDateTime.now();
        OtpLog latest = otpLogRepository.findFirstByUserIdAndPurposeOrderByIdDesc(userId, purpose).orElse(null);
        checkPasswordResetLock(latest);
        if (latest != null && latest.getCreatedAt() != null) {
            long waitMillis = Duration.between(now, latest.getCreatedAt().plusSeconds(contactCooldownSeconds)).toMillis();
            if (waitMillis > 0) throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "OTP_RATE_LIMITED",
                    "Vui lòng chờ trước khi yêu cầu lại OTP đổi liên hệ", (waitMillis + 999) / 1000);
        }
        if (otpLogRepository.countByUserIdAndPurposeAndCreatedAtAfter(userId, purpose, now.minusHours(1)) >= contactMaxRequestsPerHour) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "OTP_RATE_LIMITED",
                    "Đã đạt giới hạn " + contactMaxRequestsPerHour + " yêu cầu OTP đổi liên hệ mỗi giờ", 3600L);
        }
        generateAndSaveOtp(target, purpose, userId, null, deliveryEmail);
    }

    @Transactional
    public void invalidateContactChangeOtps(String userId) {
        otpLogRepository.invalidateByUser(userId, OtpPurpose.Change_Email, LocalDateTime.now());
        otpLogRepository.invalidateByUser(userId, OtpPurpose.Change_Phone, LocalDateTime.now());
    }

    private boolean isContactPurpose(OtpPurpose purpose) {
        return purpose == OtpPurpose.Change_Email || purpose == OtpPurpose.Change_Phone;
    }

    // The caller holds the user's write lock so concurrent requests share these limits.
    @Transactional
    public void requestPasswordResetOtp(String email, String userId) {
        String target = normalizeTarget(email);
        LocalDateTime now = LocalDateTime.now();
        OtpLog latest = otpLogRepository.findFirstByTargetAndPurposeAndUserIdOrderByIdDesc(
                target, OtpPurpose.Reset_Password, userId).orElse(null);
        checkPasswordResetLock(latest);
        if (latest != null && latest.getCreatedAt() != null
                && latest.getCreatedAt().plusSeconds(resendCooldownSeconds).isAfter(now)) {
            return;
        }
        if (otpLogRepository.countByUserIdAndPurposeAndCreatedAtAfter(
                userId, OtpPurpose.Reset_Password, now.minusHours(1)) >= maxRequestsPerHour) {
            return;
        }
        generateAndSaveOtp(target, OtpPurpose.Reset_Password, userId, null);
    }

    @Transactional
    public void invalidatePasswordResetOtps(String userId) {
        otpLogRepository.invalidateByUser(userId, OtpPurpose.Reset_Password, LocalDateTime.now());
    }

    @Transactional(noRollbackFor = OtpLockedException.class)
    public boolean verifyOtp(String target, String otpCode, OtpPurpose purpose) {
        return verifyOtp(target, otpCode, purpose, null);
    }

    @Transactional(noRollbackFor = OtpLockedException.class)
    public boolean verifyOtp(String target, String otpCode, OtpPurpose purpose, String userId) {
        String normalizedOtpCode = otpCode == null ? null : otpCode.trim();
        if (target == null || target.isBlank() || normalizedOtpCode == null || !normalizedOtpCode.matches("\\d{6}") || purpose == null) {
            return false;
        }
        String normalizedTarget = normalizeTarget(target);
        // Inspect the newest row even after it is used; never fall back to an older code.
        OtpLog otpLog = (userId == null ? otpLogRepository.findFirstByTargetAndPurposeOrderByIdDesc(normalizedTarget, purpose) : otpLogRepository.findFirstByTargetAndPurposeAndUserIdOrderByIdDesc(normalizedTarget, purpose, userId)).orElse(null);
        if (purpose == OtpPurpose.Reset_Password || isContactPurpose(purpose)) {
            checkPasswordResetLock(otpLog);
        }
        if (otpLog == null || Boolean.TRUE.equals(otpLog.getIsUsed())) {
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
        } else if ((purpose == OtpPurpose.Reset_Password || isContactPurpose(purpose))
                && otpLog.getAttemptCount() >= otpLog.getMaxAttempts()) {
            // Start the wait at the fifth failure, not at the time the email was requested.
            otpLog.setLockedUntil(LocalDateTime.now().plusSeconds(isContactPurpose(purpose) ? contactCooldownSeconds : resendCooldownSeconds));
        }
        otpLogRepository.save(otpLog);
        if (!valid && (purpose == OtpPurpose.Reset_Password || isContactPurpose(purpose))) {
            checkPasswordResetLock(otpLog);
        }
        return valid;
    }

    private void checkPasswordResetLock(OtpLog otpLog) {
        if (otpLog == null || otpLog.getLockedUntil() == null) {
            return;
        }
        long remainingMillis = Duration.between(LocalDateTime.now(), otpLog.getLockedUntil()).toMillis();
        if (remainingMillis > 0) {
            throw new OtpLockedException((remainingMillis + 999) / 1000);
        }
    }

    private String normalizeTarget(String target) {
        if (target == null) {
            return null;
        }
        String normalizedTarget = target.trim();
        return normalizedTarget.contains("@") ? normalizedTarget.toLowerCase(Locale.ROOT) : normalizedTarget;
    }
}

