package com.smart_cafe_ai.identity_service.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;

public class ResendOtpRequest {
    @JsonProperty("phone_email")
    private String phoneEmail;
    public static class ResendOtpRequestBuilder {
        private String phoneEmail;
        ResendOtpRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("phone_email")
        public ResendOtpRequest.ResendOtpRequestBuilder phoneEmail(final String phoneEmail) {
            this.phoneEmail = phoneEmail;
            return this;
        }
        public ResendOtpRequest build() {
            return new ResendOtpRequest(this.phoneEmail);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "ResendOtpRequest.ResendOtpRequestBuilder(phoneEmail=" + this.phoneEmail + ")";
        }
    }
    public static ResendOtpRequest.ResendOtpRequestBuilder builder() {
        return new ResendOtpRequest.ResendOtpRequestBuilder();
    }
    public String getPhoneEmail() {
        return this.phoneEmail;
    }
    public void setPhoneEmail(final String phoneEmail) {
        this.phoneEmail = phoneEmail;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof ResendOtpRequest)) return false;
        final ResendOtpRequest other = (ResendOtpRequest) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$phoneEmail = this.getPhoneEmail();
        final java.lang.Object other$phoneEmail = other.getPhoneEmail();
        if (this$phoneEmail == null ? other$phoneEmail != null : !this$phoneEmail.equals(other$phoneEmail)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof ResendOtpRequest;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $phoneEmail = this.getPhoneEmail();
        result = result * PRIME + ($phoneEmail == null ? 43 : $phoneEmail.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "ResendOtpRequest(phoneEmail=" + this.getPhoneEmail() + ")";
    }
    public ResendOtpRequest() {
    }
    public ResendOtpRequest(final String phoneEmail) {
        this.phoneEmail = phoneEmail;
    }
}

