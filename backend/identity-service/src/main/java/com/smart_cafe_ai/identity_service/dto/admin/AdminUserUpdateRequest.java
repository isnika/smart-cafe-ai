package com.smart_cafe_ai.identity_service.dto.admin;

import com.fasterxml.jackson.annotation.JsonProperty;

public class AdminUserUpdateRequest {
    @JsonProperty("full_name")
    private String fullName;
    private String email;
    private String phone;
    private String avatar;
    public static class AdminUserUpdateRequestBuilder {
        private String fullName;
        private String email;
        private String phone;
        private String avatar;
        AdminUserUpdateRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("full_name")
        public AdminUserUpdateRequest.AdminUserUpdateRequestBuilder fullName(final String fullName) {
            this.fullName = fullName;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AdminUserUpdateRequest.AdminUserUpdateRequestBuilder email(final String email) {
            this.email = email;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AdminUserUpdateRequest.AdminUserUpdateRequestBuilder phone(final String phone) {
            this.phone = phone;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AdminUserUpdateRequest.AdminUserUpdateRequestBuilder avatar(final String avatar) {
            this.avatar = avatar;
            return this;
        }
        public AdminUserUpdateRequest build() {
            return new AdminUserUpdateRequest(this.fullName, this.email, this.phone, this.avatar);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "AdminUserUpdateRequest.AdminUserUpdateRequestBuilder(fullName=" + this.fullName + ", email=" + this.email + ", phone=" + this.phone + ", avatar=" + this.avatar + ")";
        }
    }
    public static AdminUserUpdateRequest.AdminUserUpdateRequestBuilder builder() {
        return new AdminUserUpdateRequest.AdminUserUpdateRequestBuilder();
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

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof AdminUserUpdateRequest)) return false;
        final AdminUserUpdateRequest other = (AdminUserUpdateRequest) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
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
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof AdminUserUpdateRequest;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $fullName = this.getFullName();
        result = result * PRIME + ($fullName == null ? 43 : $fullName.hashCode());
        final java.lang.Object $email = this.getEmail();
        result = result * PRIME + ($email == null ? 43 : $email.hashCode());
        final java.lang.Object $phone = this.getPhone();
        result = result * PRIME + ($phone == null ? 43 : $phone.hashCode());
        final java.lang.Object $avatar = this.getAvatar();
        result = result * PRIME + ($avatar == null ? 43 : $avatar.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "AdminUserUpdateRequest(fullName=" + this.getFullName() + ", email=" + this.getEmail() + ", phone=" + this.getPhone() + ", avatar=" + this.getAvatar() + ")";
    }
    public AdminUserUpdateRequest() {
    }
    public AdminUserUpdateRequest(final String fullName, final String email, final String phone, final String avatar) {
        this.fullName = fullName;
        this.email = email;
        this.phone = phone;
        this.avatar = avatar;
    }
}

