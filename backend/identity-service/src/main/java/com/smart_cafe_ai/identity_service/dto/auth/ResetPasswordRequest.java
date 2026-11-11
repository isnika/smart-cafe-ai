package com.smart_cafe_ai.identity_service.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonAlias;

public class ResetPasswordRequest {
    @JsonAlias("phoneEmail")
    @JsonProperty("phone_email")
    private String phoneEmail;
    @JsonAlias("otpCode")
    @JsonProperty("otp_code")
    private String otpCode;
    @JsonAlias("newPassword")
    @JsonProperty("new_password")
    private String newPassword;
    public static class ResetPasswordRequestBuilder {
        private String phoneEmail;
        private String otpCode;
        private String newPassword;
        ResetPasswordRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        @JsonAlias("phoneEmail")
        @JsonProperty("phone_email")
        public ResetPasswordRequest.ResetPasswordRequestBuilder phoneEmail(final String phoneEmail) {
            this.phoneEmail = phoneEmail;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonAlias("otpCode")
        @JsonProperty("otp_code")
        public ResetPasswordRequest.ResetPasswordRequestBuilder otpCode(final String otpCode) {
            this.otpCode = otpCode;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonAlias("newPassword")
        @JsonProperty("new_password")
        public ResetPasswordRequest.ResetPasswordRequestBuilder newPassword(final String newPassword) {
            this.newPassword = newPassword;
            return this;
        }
        public ResetPasswordRequest build() {
            return new ResetPasswordRequest(this.phoneEmail, this.otpCode, this.newPassword);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "ResetPasswordRequest.ResetPasswordRequestBuilder(phoneEmail=" + this.phoneEmail + ", otpCode=" + this.otpCode + ", newPassword=" + this.newPassword + ")";
        }
    }
    public static ResetPasswordRequest.ResetPasswordRequestBuilder builder() {
        return new ResetPasswordRequest.ResetPasswordRequestBuilder();
    }
    public String getPhoneEmail() {
        return this.phoneEmail;
    }
    public String getOtpCode() {
        return this.otpCode;
    }
    public String getNewPassword() {
        return this.newPassword;
    }
    public void setPhoneEmail(final String phoneEmail) {
        this.phoneEmail = phoneEmail;
    }
    public void setOtpCode(final String otpCode) {
        this.otpCode = otpCode;
    }
    public void setNewPassword(final String newPassword) {
        this.newPassword = newPassword;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof ResetPasswordRequest)) return false;
        final ResetPasswordRequest other = (ResetPasswordRequest) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$phoneEmail = this.getPhoneEmail();
        final java.lang.Object other$phoneEmail = other.getPhoneEmail();
        if (this$phoneEmail == null ? other$phoneEmail != null : !this$phoneEmail.equals(other$phoneEmail)) return false;
        final java.lang.Object this$otpCode = this.getOtpCode();
        final java.lang.Object other$otpCode = other.getOtpCode();
        if (this$otpCode == null ? other$otpCode != null : !this$otpCode.equals(other$otpCode)) return false;
        final java.lang.Object this$newPassword = this.getNewPassword();
        final java.lang.Object other$newPassword = other.getNewPassword();
        if (this$newPassword == null ? other$newPassword != null : !this$newPassword.equals(other$newPassword)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof ResetPasswordRequest;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $phoneEmail = this.getPhoneEmail();
        result = result * PRIME + ($phoneEmail == null ? 43 : $phoneEmail.hashCode());
        final java.lang.Object $otpCode = this.getOtpCode();
        result = result * PRIME + ($otpCode == null ? 43 : $otpCode.hashCode());
        final java.lang.Object $newPassword = this.getNewPassword();
        result = result * PRIME + ($newPassword == null ? 43 : $newPassword.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "ResetPasswordRequest(phoneEmail=" + this.getPhoneEmail() + ", otpCode=" + this.getOtpCode() + ", newPassword=" + this.getNewPassword() + ")";
    }
    public ResetPasswordRequest() {
    }
    public ResetPasswordRequest(final String phoneEmail, final String otpCode, final String newPassword) {
        this.phoneEmail = phoneEmail;
        this.otpCode = otpCode;
        this.newPassword = newPassword;
    }
}

