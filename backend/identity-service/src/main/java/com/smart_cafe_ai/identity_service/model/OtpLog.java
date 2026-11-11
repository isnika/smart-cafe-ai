package com.smart_cafe_ai.identity_service.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "OTP_Logs")
public class OtpLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "user_id", length = 36)
    private String userId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OtpChannel channel;
    @Column(nullable = false, length = 100)
    private String target;
    @Column(name = "otp_hash", nullable = false, length = 255)
    private String otpHash;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OtpPurpose purpose;
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;
    @Column(name = "attempt_count", nullable = false)
    private Integer attemptCount;
    @Column(name = "max_attempts", nullable = false)
    private Integer maxAttempts;
    @Column(name = "locked_until")
    private LocalDateTime lockedUntil;
    @Column(name = "is_used", nullable = false)
    private Boolean isUsed;
    @Column(name = "used_at")
    private LocalDateTime usedAt;
    @Column(name = "ip_address", length = 45)
    private String ipAddress;
    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
    private static Integer $default$attemptCount() {
        return 0;
    }
    private static Integer $default$maxAttempts() {
        return 5;
    }
    private static Boolean $default$isUsed() {
        return false;
    }
    public static class OtpLogBuilder {
        private Long id;
        private String userId;
        private OtpChannel channel;
        private String target;
        private String otpHash;
        private OtpPurpose purpose;
        private LocalDateTime expiresAt;
        private boolean attemptCount$set;
        private Integer attemptCount$value;
        private boolean maxAttempts$set;
        private Integer maxAttempts$value;
        private boolean isUsed$set;
        private Boolean isUsed$value;
        private LocalDateTime usedAt;
        private String ipAddress;
        private LocalDateTime createdAt;
        OtpLogBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public OtpLog.OtpLogBuilder id(final Long id) {
            this.id = id;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OtpLog.OtpLogBuilder userId(final String userId) {
            this.userId = userId;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OtpLog.OtpLogBuilder channel(final OtpChannel channel) {
            this.channel = channel;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OtpLog.OtpLogBuilder target(final String target) {
            this.target = target;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OtpLog.OtpLogBuilder otpHash(final String otpHash) {
            this.otpHash = otpHash;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OtpLog.OtpLogBuilder purpose(final OtpPurpose purpose) {
            this.purpose = purpose;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OtpLog.OtpLogBuilder expiresAt(final LocalDateTime expiresAt) {
            this.expiresAt = expiresAt;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OtpLog.OtpLogBuilder attemptCount(final Integer attemptCount) {
            this.attemptCount$value = attemptCount;
            attemptCount$set = true;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OtpLog.OtpLogBuilder maxAttempts(final Integer maxAttempts) {
            this.maxAttempts$value = maxAttempts;
            maxAttempts$set = true;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OtpLog.OtpLogBuilder isUsed(final Boolean isUsed) {
            this.isUsed$value = isUsed;
            isUsed$set = true;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OtpLog.OtpLogBuilder usedAt(final LocalDateTime usedAt) {
            this.usedAt = usedAt;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OtpLog.OtpLogBuilder ipAddress(final String ipAddress) {
            this.ipAddress = ipAddress;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OtpLog.OtpLogBuilder createdAt(final LocalDateTime createdAt) {
            this.createdAt = createdAt;
            return this;
        }
        public OtpLog build() {
            Integer attemptCount$value = this.attemptCount$value;
            if (!this.attemptCount$set) attemptCount$value = OtpLog.$default$attemptCount();
            Integer maxAttempts$value = this.maxAttempts$value;
            if (!this.maxAttempts$set) maxAttempts$value = OtpLog.$default$maxAttempts();
            Boolean isUsed$value = this.isUsed$value;
            if (!this.isUsed$set) isUsed$value = OtpLog.$default$isUsed();
            return new OtpLog(this.id, this.userId, this.channel, this.target, this.otpHash, this.purpose, this.expiresAt, attemptCount$value, maxAttempts$value, isUsed$value, this.usedAt, this.ipAddress, this.createdAt);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "OtpLog.OtpLogBuilder(id=" + this.id + ", userId=" + this.userId + ", channel=" + this.channel + ", target=" + this.target + ", otpHash=" + this.otpHash + ", purpose=" + this.purpose + ", expiresAt=" + this.expiresAt + ", attemptCount$value=" + this.attemptCount$value + ", maxAttempts$value=" + this.maxAttempts$value + ", isUsed$value=" + this.isUsed$value + ", usedAt=" + this.usedAt + ", ipAddress=" + this.ipAddress + ", createdAt=" + this.createdAt + ")";
        }
    }
    public static OtpLog.OtpLogBuilder builder() {
        return new OtpLog.OtpLogBuilder();
    }
    public Long getId() {
        return this.id;
    }
    public String getUserId() {
        return this.userId;
    }
    public OtpChannel getChannel() {
        return this.channel;
    }
    public String getTarget() {
        return this.target;
    }
    public String getOtpHash() {
        return this.otpHash;
    }
    public OtpPurpose getPurpose() {
        return this.purpose;
    }
    public LocalDateTime getExpiresAt() {
        return this.expiresAt;
    }
    public Integer getAttemptCount() {
        return this.attemptCount;
    }
    public Integer getMaxAttempts() {
        return this.maxAttempts;
    }
    public LocalDateTime getLockedUntil() {
        return this.lockedUntil;
    }
    public Boolean getIsUsed() {
        return this.isUsed;
    }
    public LocalDateTime getUsedAt() {
        return this.usedAt;
    }
    public String getIpAddress() {
        return this.ipAddress;
    }
    public LocalDateTime getCreatedAt() {
        return this.createdAt;
    }
    public void setId(final Long id) {
        this.id = id;
    }
    public void setUserId(final String userId) {
        this.userId = userId;
    }
    public void setChannel(final OtpChannel channel) {
        this.channel = channel;
    }
    public void setTarget(final String target) {
        this.target = target;
    }
    public void setOtpHash(final String otpHash) {
        this.otpHash = otpHash;
    }
    public void setPurpose(final OtpPurpose purpose) {
        this.purpose = purpose;
    }
    public void setExpiresAt(final LocalDateTime expiresAt) {
        this.expiresAt = expiresAt;
    }
    public void setAttemptCount(final Integer attemptCount) {
        this.attemptCount = attemptCount;
    }
    public void setMaxAttempts(final Integer maxAttempts) {
        this.maxAttempts = maxAttempts;
    }
    public void setLockedUntil(final LocalDateTime lockedUntil) {
        this.lockedUntil = lockedUntil;
    }
    public void setIsUsed(final Boolean isUsed) {
        this.isUsed = isUsed;
    }
    public void setUsedAt(final LocalDateTime usedAt) {
        this.usedAt = usedAt;
    }
    public void setIpAddress(final String ipAddress) {
        this.ipAddress = ipAddress;
    }
    public void setCreatedAt(final LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
    public OtpLog() {
        this.attemptCount = OtpLog.$default$attemptCount();
        this.maxAttempts = OtpLog.$default$maxAttempts();
        this.isUsed = OtpLog.$default$isUsed();
    }
    public OtpLog(final Long id, final String userId, final OtpChannel channel, final String target, final String otpHash, final OtpPurpose purpose, final LocalDateTime expiresAt, final Integer attemptCount, final Integer maxAttempts, final Boolean isUsed, final LocalDateTime usedAt, final String ipAddress, final LocalDateTime createdAt) {
        this.id = id;
        this.userId = userId;
        this.channel = channel;
        this.target = target;
        this.otpHash = otpHash;
        this.purpose = purpose;
        this.expiresAt = expiresAt;
        this.attemptCount = attemptCount;
        this.maxAttempts = maxAttempts;
        this.isUsed = isUsed;
        this.usedAt = usedAt;
        this.ipAddress = ipAddress;
        this.createdAt = createdAt;
    }
}

