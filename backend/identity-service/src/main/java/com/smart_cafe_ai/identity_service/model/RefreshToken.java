package com.smart_cafe_ai.identity_service.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "Refresh_Tokens")
public class RefreshToken {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
    @Column(name = "token_hash", nullable = false, unique = true, length = 255)
    private String tokenHash;
    @Column(name = "device_info", length = 255)
    private String deviceInfo;
    @Column(name = "ip_address", length = 45)
    private String ipAddress;
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;
    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;
    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
    public static class RefreshTokenBuilder {
        private Long id;
        private User user;
        private String tokenHash;
        private String deviceInfo;
        private String ipAddress;
        private LocalDateTime expiresAt;
        private LocalDateTime revokedAt;
        private LocalDateTime createdAt;
        RefreshTokenBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public RefreshToken.RefreshTokenBuilder id(final Long id) {
            this.id = id;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public RefreshToken.RefreshTokenBuilder user(final User user) {
            this.user = user;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public RefreshToken.RefreshTokenBuilder tokenHash(final String tokenHash) {
            this.tokenHash = tokenHash;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public RefreshToken.RefreshTokenBuilder deviceInfo(final String deviceInfo) {
            this.deviceInfo = deviceInfo;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public RefreshToken.RefreshTokenBuilder ipAddress(final String ipAddress) {
            this.ipAddress = ipAddress;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public RefreshToken.RefreshTokenBuilder expiresAt(final LocalDateTime expiresAt) {
            this.expiresAt = expiresAt;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public RefreshToken.RefreshTokenBuilder revokedAt(final LocalDateTime revokedAt) {
            this.revokedAt = revokedAt;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public RefreshToken.RefreshTokenBuilder createdAt(final LocalDateTime createdAt) {
            this.createdAt = createdAt;
            return this;
        }
        public RefreshToken build() {
            return new RefreshToken(this.id, this.user, this.tokenHash, this.deviceInfo, this.ipAddress, this.expiresAt, this.revokedAt, this.createdAt);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "RefreshToken.RefreshTokenBuilder(id=" + this.id + ", user=" + this.user + ", tokenHash=" + this.tokenHash + ", deviceInfo=" + this.deviceInfo + ", ipAddress=" + this.ipAddress + ", expiresAt=" + this.expiresAt + ", revokedAt=" + this.revokedAt + ", createdAt=" + this.createdAt + ")";
        }
    }
    public static RefreshToken.RefreshTokenBuilder builder() {
        return new RefreshToken.RefreshTokenBuilder();
    }
    public Long getId() {
        return this.id;
    }
    public User getUser() {
        return this.user;
    }
    public String getTokenHash() {
        return this.tokenHash;
    }
    public String getDeviceInfo() {
        return this.deviceInfo;
    }
    public String getIpAddress() {
        return this.ipAddress;
    }
    public LocalDateTime getExpiresAt() {
        return this.expiresAt;
    }
    public LocalDateTime getRevokedAt() {
        return this.revokedAt;
    }
    public LocalDateTime getCreatedAt() {
        return this.createdAt;
    }
    public void setId(final Long id) {
        this.id = id;
    }
    public void setUser(final User user) {
        this.user = user;
    }
    public void setTokenHash(final String tokenHash) {
        this.tokenHash = tokenHash;
    }
    public void setDeviceInfo(final String deviceInfo) {
        this.deviceInfo = deviceInfo;
    }
    public void setIpAddress(final String ipAddress) {
        this.ipAddress = ipAddress;
    }
    public void setExpiresAt(final LocalDateTime expiresAt) {
        this.expiresAt = expiresAt;
    }
    public void setRevokedAt(final LocalDateTime revokedAt) {
        this.revokedAt = revokedAt;
    }
    public void setCreatedAt(final LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
    public RefreshToken() {
    }
    public RefreshToken(final Long id, final User user, final String tokenHash, final String deviceInfo, final String ipAddress, final LocalDateTime expiresAt, final LocalDateTime revokedAt, final LocalDateTime createdAt) {
        this.id = id;
        this.user = user;
        this.tokenHash = tokenHash;
        this.deviceInfo = deviceInfo;
        this.ipAddress = ipAddress;
        this.expiresAt = expiresAt;
        this.revokedAt = revokedAt;
        this.createdAt = createdAt;
    }
}

