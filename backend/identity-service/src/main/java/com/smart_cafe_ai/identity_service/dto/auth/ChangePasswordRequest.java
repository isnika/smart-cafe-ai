package com.smart_cafe_ai.identity_service.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonAlias;

public class ChangePasswordRequest {
    @JsonAlias("currentPassword")
    @JsonProperty("current_password")
    private String currentPassword;
    @JsonAlias("newPassword")
    @JsonProperty("new_password")
    private String newPassword;
    @JsonAlias("otpCode")
    @JsonProperty("otp_code")
    private String otpCode;
    public static class ChangePasswordRequestBuilder {
        private String currentPassword;
        private String newPassword;
        private String otpCode;
        ChangePasswordRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        @JsonAlias("currentPassword")
        @JsonProperty("current_password")
        public ChangePasswordRequest.ChangePasswordRequestBuilder currentPassword(final String currentPassword) {
            this.currentPassword = currentPassword;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonAlias("newPassword")
        @JsonProperty("new_password")
        public ChangePasswordRequest.ChangePasswordRequestBuilder newPassword(final String newPassword) {
            this.newPassword = newPassword;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonAlias("otpCode")
        @JsonProperty("otp_code")
        public ChangePasswordRequest.ChangePasswordRequestBuilder otpCode(final String otpCode) {
            this.otpCode = otpCode;
            return this;
        }
        public ChangePasswordRequest build() {
            return new ChangePasswordRequest(this.currentPassword, this.newPassword, this.otpCode);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "ChangePasswordRequest.ChangePasswordRequestBuilder(currentPassword=" + this.currentPassword + ", newPassword=" + this.newPassword + ", otpCode=" + this.otpCode + ")";
        }
    }
    public static ChangePasswordRequest.ChangePasswordRequestBuilder builder() {
        return new ChangePasswordRequest.ChangePasswordRequestBuilder();
    }
    public String getCurrentPassword() {
        return this.currentPassword;
    }
    public String getNewPassword() {
        return this.newPassword;
    }
    public String getOtpCode() {
        return this.otpCode;
    }
    public void setCurrentPassword(final String currentPassword) {
        this.currentPassword = currentPassword;
    }
    public void setNewPassword(final String newPassword) {
        this.newPassword = newPassword;
    }
    public void setOtpCode(final String otpCode) {
        this.otpCode = otpCode;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof ChangePasswordRequest)) return false;
        final ChangePasswordRequest other = (ChangePasswordRequest) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$currentPassword = this.getCurrentPassword();
        final java.lang.Object other$currentPassword = other.getCurrentPassword();
        if (this$currentPassword == null ? other$currentPassword != null : !this$currentPassword.equals(other$currentPassword)) return false;
        final java.lang.Object this$newPassword = this.getNewPassword();
        final java.lang.Object other$newPassword = other.getNewPassword();
        if (this$newPassword == null ? other$newPassword != null : !this$newPassword.equals(other$newPassword)) return false;
        final java.lang.Object this$otpCode = this.getOtpCode();
        final java.lang.Object other$otpCode = other.getOtpCode();
        if (this$otpCode == null ? other$otpCode != null : !this$otpCode.equals(other$otpCode)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof ChangePasswordRequest;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $currentPassword = this.getCurrentPassword();
        result = result * PRIME + ($currentPassword == null ? 43 : $currentPassword.hashCode());
        final java.lang.Object $newPassword = this.getNewPassword();
        result = result * PRIME + ($newPassword == null ? 43 : $newPassword.hashCode());
        final java.lang.Object $otpCode = this.getOtpCode();
        result = result * PRIME + ($otpCode == null ? 43 : $otpCode.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "ChangePasswordRequest(currentPassword=" + this.getCurrentPassword() + ", newPassword=" + this.getNewPassword() + ", otpCode=" + this.getOtpCode() + ")";
    }
    public ChangePasswordRequest() {
    }
    public ChangePasswordRequest(final String currentPassword, final String newPassword, final String otpCode) {
        this.currentPassword = currentPassword;
        this.newPassword = newPassword;
        this.otpCode = otpCode;
    }
}

