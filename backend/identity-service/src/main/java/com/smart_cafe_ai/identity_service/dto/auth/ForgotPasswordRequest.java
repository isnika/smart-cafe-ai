package com.smart_cafe_ai.identity_service.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonAlias;

public class ForgotPasswordRequest {
    @JsonAlias("phoneEmail")
    @JsonProperty("phone_email")
    private String phoneEmail;
    public static class ForgotPasswordRequestBuilder {
        private String phoneEmail;
        ForgotPasswordRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        @JsonAlias("phoneEmail")
        @JsonProperty("phone_email")
        public ForgotPasswordRequest.ForgotPasswordRequestBuilder phoneEmail(final String phoneEmail) {
            this.phoneEmail = phoneEmail;
            return this;
        }
        public ForgotPasswordRequest build() {
            return new ForgotPasswordRequest(this.phoneEmail);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "ForgotPasswordRequest.ForgotPasswordRequestBuilder(phoneEmail=" + this.phoneEmail + ")";
        }
    }
    public static ForgotPasswordRequest.ForgotPasswordRequestBuilder builder() {
        return new ForgotPasswordRequest.ForgotPasswordRequestBuilder();
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
        if (!(o instanceof ForgotPasswordRequest)) return false;
        final ForgotPasswordRequest other = (ForgotPasswordRequest) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$phoneEmail = this.getPhoneEmail();
        final java.lang.Object other$phoneEmail = other.getPhoneEmail();
        if (this$phoneEmail == null ? other$phoneEmail != null : !this$phoneEmail.equals(other$phoneEmail)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof ForgotPasswordRequest;
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
        return "ForgotPasswordRequest(phoneEmail=" + this.getPhoneEmail() + ")";
    }
    public ForgotPasswordRequest() {
    }
    public ForgotPasswordRequest(final String phoneEmail) {
        this.phoneEmail = phoneEmail;
    }
}

