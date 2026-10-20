package com.smart_cafe_ai.identity_service.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;

public class VerifyOtpRequest {
    @JsonProperty("phone_email")
    private String phoneEmail;
    @JsonProperty("otp_code")
    private String otpCode;
    public static class VerifyOtpRequestBuilder {
        private String phoneEmail;
        private String otpCode;
        VerifyOtpRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("phone_email")
        public VerifyOtpRequest.VerifyOtpRequestBuilder phoneEmail(final String phoneEmail) {
            this.phoneEmail = phoneEmail;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("otp_code")
        public VerifyOtpRequest.VerifyOtpRequestBuilder otpCode(final String otpCode) {
            this.otpCode = otpCode;
            return this;
        }
        public VerifyOtpRequest build() {
            return new VerifyOtpRequest(this.phoneEmail, this.otpCode);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "VerifyOtpRequest.VerifyOtpRequestBuilder(phoneEmail=" + this.phoneEmail + ", otpCode=" + this.otpCode + ")";
        }
    }
    public static VerifyOtpRequest.VerifyOtpRequestBuilder builder() {
        return new VerifyOtpRequest.VerifyOtpRequestBuilder();
    }
    public String getPhoneEmail() {
        return this.phoneEmail;
    }
    public String getOtpCode() {
        return this.otpCode;
    }
    public void setPhoneEmail(final String phoneEmail) {
        this.phoneEmail = phoneEmail;
    }
    public void setOtpCode(final String otpCode) {
        this.otpCode = otpCode;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof VerifyOtpRequest)) return false;
        final VerifyOtpRequest other = (VerifyOtpRequest) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$phoneEmail = this.getPhoneEmail();
        final java.lang.Object other$phoneEmail = other.getPhoneEmail();
        if (this$phoneEmail == null ? other$phoneEmail != null : !this$phoneEmail.equals(other$phoneEmail)) return false;
        final java.lang.Object this$otpCode = this.getOtpCode();
        final java.lang.Object other$otpCode = other.getOtpCode();
        if (this$otpCode == null ? other$otpCode != null : !this$otpCode.equals(other$otpCode)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof VerifyOtpRequest;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $phoneEmail = this.getPhoneEmail();
        result = result * PRIME + ($phoneEmail == null ? 43 : $phoneEmail.hashCode());
        final java.lang.Object $otpCode = this.getOtpCode();
        result = result * PRIME + ($otpCode == null ? 43 : $otpCode.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "VerifyOtpRequest(phoneEmail=" + this.getPhoneEmail() + ", otpCode=" + this.getOtpCode() + ")";
    }
    public VerifyOtpRequest() {
    }
    public VerifyOtpRequest(final String phoneEmail, final String otpCode) {
        this.phoneEmail = phoneEmail;
        this.otpCode = otpCode;
    }
}

