package com.smart_cafe_ai.identity_service.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "Users")
public class User {
    @Id
    @Column(length = 36)
    private String id;
    @Column(unique = true, length = 100)
    private String email;
    @Column(unique = true, length = 20)
    private String phone;
    @Column(name = "password_hash", length = 255)
    private String passwordHash;
    @Column(name = "google_id", unique = true, length = 100)
    private String googleId;
    @Column(name = "full_name", nullable = false, length = 100)
    private String fullName;
    @Column(length = 255)
    private String avatar;
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "role_id", nullable = false)
    private Role role;
    @Enumerated(EnumType.STRING)
    @Column(columnDefinition = "ENUM(\'Unverified\', \'Active\', \'Banned\', \'Deactivated\') DEFAULT \'Unverified\'")
    private UserStatus status;
    @Column(name = "email_verified_at")
    private LocalDateTime emailVerifiedAt;
    @Column(name = "phone_verified_at")
    private LocalDateTime phoneVerifiedAt;
    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;
    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    public void ensureIdAndStatus() {
        if (this.id == null || this.id.isBlank()) {
            this.id = java.util.UUID.randomUUID().toString();
        }
        if (this.status == null) {
            this.status = UserStatus.Unverified;
        }
    }
    public static class UserBuilder {
        private String id;
        private String email;
        private String phone;
        private String passwordHash;
        private String googleId;
        private String fullName;
        private String avatar;
        private Role role;
        private UserStatus status;
        private LocalDateTime emailVerifiedAt;
        private LocalDateTime phoneVerifiedAt;
        private LocalDateTime lastLoginAt;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        UserBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public User.UserBuilder id(final String id) {
            this.id = id;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public User.UserBuilder email(final String email) {
            this.email = email;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public User.UserBuilder phone(final String phone) {
            this.phone = phone;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public User.UserBuilder passwordHash(final String passwordHash) {
            this.passwordHash = passwordHash;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public User.UserBuilder googleId(final String googleId) {
            this.googleId = googleId;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public User.UserBuilder fullName(final String fullName) {
            this.fullName = fullName;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public User.UserBuilder avatar(final String avatar) {
            this.avatar = avatar;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public User.UserBuilder role(final Role role) {
            this.role = role;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public User.UserBuilder status(final UserStatus status) {
            this.status = status;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public User.UserBuilder emailVerifiedAt(final LocalDateTime emailVerifiedAt) {
            this.emailVerifiedAt = emailVerifiedAt;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public User.UserBuilder phoneVerifiedAt(final LocalDateTime phoneVerifiedAt) {
            this.phoneVerifiedAt = phoneVerifiedAt;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public User.UserBuilder lastLoginAt(final LocalDateTime lastLoginAt) {
            this.lastLoginAt = lastLoginAt;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public User.UserBuilder createdAt(final LocalDateTime createdAt) {
            this.createdAt = createdAt;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public User.UserBuilder updatedAt(final LocalDateTime updatedAt) {
            this.updatedAt = updatedAt;
            return this;
        }
        public User build() {
            return new User(this.id, this.email, this.phone, this.passwordHash, this.googleId, this.fullName, this.avatar, this.role, this.status, this.emailVerifiedAt, this.phoneVerifiedAt, this.lastLoginAt, this.createdAt, this.updatedAt);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "User.UserBuilder(id=" + this.id + ", email=" + this.email + ", phone=" + this.phone + ", passwordHash=" + this.passwordHash + ", googleId=" + this.googleId + ", fullName=" + this.fullName + ", avatar=" + this.avatar + ", role=" + this.role + ", status=" + this.status + ", emailVerifiedAt=" + this.emailVerifiedAt + ", phoneVerifiedAt=" + this.phoneVerifiedAt + ", lastLoginAt=" + this.lastLoginAt + ", createdAt=" + this.createdAt + ", updatedAt=" + this.updatedAt + ")";
        }
    }
    public static User.UserBuilder builder() {
        return new User.UserBuilder();
    }
    public String getId() {
        return this.id;
    }
    public String getEmail() {
        return this.email;
    }
    public String getPhone() {
        return this.phone;
    }
    public String getPasswordHash() {
        return this.passwordHash;
    }
    public String getGoogleId() {
        return this.googleId;
    }
    public String getFullName() {
        return this.fullName;
    }
    public String getAvatar() {
        return this.avatar;
    }
    public Role getRole() {
        return this.role;
    }
    public UserStatus getStatus() {
        return this.status;
    }
    public LocalDateTime getEmailVerifiedAt() {
        return this.emailVerifiedAt;
    }
    public LocalDateTime getPhoneVerifiedAt() {
        return this.phoneVerifiedAt;
    }
    public LocalDateTime getLastLoginAt() {
        return this.lastLoginAt;
    }
    public LocalDateTime getCreatedAt() {
        return this.createdAt;
    }
    public LocalDateTime getUpdatedAt() {
        return this.updatedAt;
    }
    public void setId(final String id) {
        this.id = id;
    }
    public void setEmail(final String email) {
        this.email = email;
    }
    public void setPhone(final String phone) {
        this.phone = phone;
    }
    public void setPasswordHash(final String passwordHash) {
        this.passwordHash = passwordHash;
    }
    public void setGoogleId(final String googleId) {
        this.googleId = googleId;
    }
    public void setFullName(final String fullName) {
        this.fullName = fullName;
    }
    public void setAvatar(final String avatar) {
        this.avatar = avatar;
    }
    public void setRole(final Role role) {
        this.role = role;
    }
    public void setStatus(final UserStatus status) {
        this.status = status;
    }
    public void setEmailVerifiedAt(final LocalDateTime emailVerifiedAt) {
        this.emailVerifiedAt = emailVerifiedAt;
    }
    public void setPhoneVerifiedAt(final LocalDateTime phoneVerifiedAt) {
        this.phoneVerifiedAt = phoneVerifiedAt;
    }
    public void setLastLoginAt(final LocalDateTime lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }
    public void setCreatedAt(final LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
    public void setUpdatedAt(final LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
    public User() {
    }
    public User(final String id, final String email, final String phone, final String passwordHash, final String googleId, final String fullName, final String avatar, final Role role, final UserStatus status, final LocalDateTime emailVerifiedAt, final LocalDateTime phoneVerifiedAt, final LocalDateTime lastLoginAt, final LocalDateTime createdAt, final LocalDateTime updatedAt) {
        this.id = id;
        this.email = email;
        this.phone = phone;
        this.passwordHash = passwordHash;
        this.googleId = googleId;
        this.fullName = fullName;
        this.avatar = avatar;
        this.role = role;
        this.status = status;
        this.emailVerifiedAt = emailVerifiedAt;
        this.phoneVerifiedAt = phoneVerifiedAt;
        this.lastLoginAt = lastLoginAt;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
}

