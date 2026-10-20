package com.smart_cafe_ai.identity_service.dto.user;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.model.UserStatus;
import java.time.LocalDateTime;

public class UserResponse {
    private String id;
    @JsonProperty("full_name")
    private String fullName;
    private String email;
    private String phone;
    private String avatar;
    @JsonProperty("role_id")
    private Integer roleId;
    @JsonProperty("role_name")
    private String roleName;
    private UserStatus status;
    @JsonProperty("email_verified_at")
    private LocalDateTime emailVerifiedAt;
    @JsonProperty("phone_verified_at")
    private LocalDateTime phoneVerifiedAt;
    @JsonProperty("last_login_at")
    private LocalDateTime lastLoginAt;
    @JsonProperty("created_at")
    private LocalDateTime createdAt;
    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;

    public static UserResponse fromEntity(User user) {
        if (user == null) {
            return null;
        }
        return UserResponse.builder().id(user.getId()).fullName(user.getFullName()).email(user.getEmail()).phone(user.getPhone()).avatar(user.getAvatar()).roleId(user.getRole() != null ? user.getRole().getId() : null).roleName(user.getRole() != null ? user.getRole().getName() : null).status(user.getStatus()).emailVerifiedAt(user.getEmailVerifiedAt()).phoneVerifiedAt(user.getPhoneVerifiedAt()).lastLoginAt(user.getLastLoginAt()).createdAt(user.getCreatedAt()).updatedAt(user.getUpdatedAt()).build();
    }
    public static class UserResponseBuilder {
        private String id;
        private String fullName;
        private String email;
        private String phone;
        private String avatar;
        private Integer roleId;
        private String roleName;
        private UserStatus status;
        private LocalDateTime emailVerifiedAt;
        private LocalDateTime phoneVerifiedAt;
        private LocalDateTime lastLoginAt;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        UserResponseBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public UserResponse.UserResponseBuilder id(final String id) {
            this.id = id;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("full_name")
        public UserResponse.UserResponseBuilder fullName(final String fullName) {
            this.fullName = fullName;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public UserResponse.UserResponseBuilder email(final String email) {
            this.email = email;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public UserResponse.UserResponseBuilder phone(final String phone) {
            this.phone = phone;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public UserResponse.UserResponseBuilder avatar(final String avatar) {
            this.avatar = avatar;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("role_id")
        public UserResponse.UserResponseBuilder roleId(final Integer roleId) {
            this.roleId = roleId;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("role_name")
        public UserResponse.UserResponseBuilder roleName(final String roleName) {
            this.roleName = roleName;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public UserResponse.UserResponseBuilder status(final UserStatus status) {
            this.status = status;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("email_verified_at")
        public UserResponse.UserResponseBuilder emailVerifiedAt(final LocalDateTime emailVerifiedAt) {
            this.emailVerifiedAt = emailVerifiedAt;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("phone_verified_at")
        public UserResponse.UserResponseBuilder phoneVerifiedAt(final LocalDateTime phoneVerifiedAt) {
            this.phoneVerifiedAt = phoneVerifiedAt;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("last_login_at")
        public UserResponse.UserResponseBuilder lastLoginAt(final LocalDateTime lastLoginAt) {
            this.lastLoginAt = lastLoginAt;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("created_at")
        public UserResponse.UserResponseBuilder createdAt(final LocalDateTime createdAt) {
            this.createdAt = createdAt;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("updated_at")
        public UserResponse.UserResponseBuilder updatedAt(final LocalDateTime updatedAt) {
            this.updatedAt = updatedAt;
            return this;
        }
        public UserResponse build() {
            return new UserResponse(this.id, this.fullName, this.email, this.phone, this.avatar, this.roleId, this.roleName, this.status, this.emailVerifiedAt, this.phoneVerifiedAt, this.lastLoginAt, this.createdAt, this.updatedAt);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "UserResponse.UserResponseBuilder(id=" + this.id + ", fullName=" + this.fullName + ", email=" + this.email + ", phone=" + this.phone + ", avatar=" + this.avatar + ", roleId=" + this.roleId + ", roleName=" + this.roleName + ", status=" + this.status + ", emailVerifiedAt=" + this.emailVerifiedAt + ", phoneVerifiedAt=" + this.phoneVerifiedAt + ", lastLoginAt=" + this.lastLoginAt + ", createdAt=" + this.createdAt + ", updatedAt=" + this.updatedAt + ")";
        }
    }
    public static UserResponse.UserResponseBuilder builder() {
        return new UserResponse.UserResponseBuilder();
    }
    public String getId() {
        return this.id;
    }
    public String getFullName() {
        return this.fullName;
    }
    public String getEmail() {
        return this.email;
    }
    public String getPhone() {
        return this.phone;
    }
    public String getAvatar() {
        return this.avatar;
    }
    public Integer getRoleId() {
        return this.roleId;
    }
    public String getRoleName() {
        return this.roleName;
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
    public void setFullName(final String fullName) {
        this.fullName = fullName;
    }
    public void setEmail(final String email) {
        this.email = email;
    }
    public void setPhone(final String phone) {
        this.phone = phone;
    }
    public void setAvatar(final String avatar) {
        this.avatar = avatar;
    }
    public void setRoleId(final Integer roleId) {
        this.roleId = roleId;
    }
    public void setRoleName(final String roleName) {
        this.roleName = roleName;
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

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof UserResponse)) return false;
        final UserResponse other = (UserResponse) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$roleId = this.getRoleId();
        final java.lang.Object other$roleId = other.getRoleId();
        if (this$roleId == null ? other$roleId != null : !this$roleId.equals(other$roleId)) return false;
        final java.lang.Object this$id = this.getId();
        final java.lang.Object other$id = other.getId();
        if (this$id == null ? other$id != null : !this$id.equals(other$id)) return false;
        final java.lang.Object this$fullName = this.getFullName();
        final java.lang.Object other$fullName = other.getFullName();
        if (this$fullName == null ? other$fullName != null : !this$fullName.equals(other$fullName)) return false;
        final java.lang.Object this$email = this.getEmail();
        final java.lang.Object other$email = other.getEmail();
        if (this$email == null ? other$email != null : !this$email.equals(other$email)) return false;
        final java.lang.Object this$phone = this.getPhone();
        final java.lang.Object other$phone = other.getPhone();
        if (this$phone == null ? other$phone != null : !this$phone.equals(other$phone)) return false;
        final java.lang.Object this$avatar = this.getAvatar();
        final java.lang.Object other$avatar = other.getAvatar();
        if (this$avatar == null ? other$avatar != null : !this$avatar.equals(other$avatar)) return false;
        final java.lang.Object this$roleName = this.getRoleName();
        final java.lang.Object other$roleName = other.getRoleName();
        if (this$roleName == null ? other$roleName != null : !this$roleName.equals(other$roleName)) return false;
        final java.lang.Object this$status = this.getStatus();
        final java.lang.Object other$status = other.getStatus();
        if (this$status == null ? other$status != null : !this$status.equals(other$status)) return false;
        final java.lang.Object this$emailVerifiedAt = this.getEmailVerifiedAt();
        final java.lang.Object other$emailVerifiedAt = other.getEmailVerifiedAt();
        if (this$emailVerifiedAt == null ? other$emailVerifiedAt != null : !this$emailVerifiedAt.equals(other$emailVerifiedAt)) return false;
        final java.lang.Object this$phoneVerifiedAt = this.getPhoneVerifiedAt();
        final java.lang.Object other$phoneVerifiedAt = other.getPhoneVerifiedAt();
        if (this$phoneVerifiedAt == null ? other$phoneVerifiedAt != null : !this$phoneVerifiedAt.equals(other$phoneVerifiedAt)) return false;
        final java.lang.Object this$lastLoginAt = this.getLastLoginAt();
        final java.lang.Object other$lastLoginAt = other.getLastLoginAt();
        if (this$lastLoginAt == null ? other$lastLoginAt != null : !this$lastLoginAt.equals(other$lastLoginAt)) return false;
        final java.lang.Object this$createdAt = this.getCreatedAt();
        final java.lang.Object other$createdAt = other.getCreatedAt();
        if (this$createdAt == null ? other$createdAt != null : !this$createdAt.equals(other$createdAt)) return false;
        final java.lang.Object this$updatedAt = this.getUpdatedAt();
        final java.lang.Object other$updatedAt = other.getUpdatedAt();
        if (this$updatedAt == null ? other$updatedAt != null : !this$updatedAt.equals(other$updatedAt)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof UserResponse;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $roleId = this.getRoleId();
        result = result * PRIME + ($roleId == null ? 43 : $roleId.hashCode());
        final java.lang.Object $id = this.getId();
        result = result * PRIME + ($id == null ? 43 : $id.hashCode());
        final java.lang.Object $fullName = this.getFullName();
        result = result * PRIME + ($fullName == null ? 43 : $fullName.hashCode());
        final java.lang.Object $email = this.getEmail();
        result = result * PRIME + ($email == null ? 43 : $email.hashCode());
        final java.lang.Object $phone = this.getPhone();
        result = result * PRIME + ($phone == null ? 43 : $phone.hashCode());
        final java.lang.Object $avatar = this.getAvatar();
        result = result * PRIME + ($avatar == null ? 43 : $avatar.hashCode());
        final java.lang.Object $roleName = this.getRoleName();
        result = result * PRIME + ($roleName == null ? 43 : $roleName.hashCode());
        final java.lang.Object $status = this.getStatus();
        result = result * PRIME + ($status == null ? 43 : $status.hashCode());
        final java.lang.Object $emailVerifiedAt = this.getEmailVerifiedAt();
        result = result * PRIME + ($emailVerifiedAt == null ? 43 : $emailVerifiedAt.hashCode());
        final java.lang.Object $phoneVerifiedAt = this.getPhoneVerifiedAt();
        result = result * PRIME + ($phoneVerifiedAt == null ? 43 : $phoneVerifiedAt.hashCode());
        final java.lang.Object $lastLoginAt = this.getLastLoginAt();
        result = result * PRIME + ($lastLoginAt == null ? 43 : $lastLoginAt.hashCode());
        final java.lang.Object $createdAt = this.getCreatedAt();
        result = result * PRIME + ($createdAt == null ? 43 : $createdAt.hashCode());
        final java.lang.Object $updatedAt = this.getUpdatedAt();
        result = result * PRIME + ($updatedAt == null ? 43 : $updatedAt.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "UserResponse(id=" + this.getId() + ", fullName=" + this.getFullName() + ", email=" + this.getEmail() + ", phone=" + this.getPhone() + ", avatar=" + this.getAvatar() + ", roleId=" + this.getRoleId() + ", roleName=" + this.getRoleName() + ", status=" + this.getStatus() + ", emailVerifiedAt=" + this.getEmailVerifiedAt() + ", phoneVerifiedAt=" + this.getPhoneVerifiedAt() + ", lastLoginAt=" + this.getLastLoginAt() + ", createdAt=" + this.getCreatedAt() + ", updatedAt=" + this.getUpdatedAt() + ")";
    }
    public UserResponse() {
    }
    public UserResponse(final String id, final String fullName, final String email, final String phone, final String avatar, final Integer roleId, final String roleName, final UserStatus status, final LocalDateTime emailVerifiedAt, final LocalDateTime phoneVerifiedAt, final LocalDateTime lastLoginAt, final LocalDateTime createdAt, final LocalDateTime updatedAt) {
        this.id = id;
        this.fullName = fullName;
        this.email = email;
        this.phone = phone;
        this.avatar = avatar;
        this.roleId = roleId;
        this.roleName = roleName;
        this.status = status;
        this.emailVerifiedAt = emailVerifiedAt;
        this.phoneVerifiedAt = phoneVerifiedAt;
        this.lastLoginAt = lastLoginAt;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
}

