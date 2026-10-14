package com.smart_cafe_ai.identity_service.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;

public class RefreshTokenRequest {
    @JsonProperty("refresh_token")
    private String refreshToken;
    public static class RefreshTokenRequestBuilder {
        private String refreshToken;
        RefreshTokenRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("refresh_token")
        public RefreshTokenRequest.RefreshTokenRequestBuilder refreshToken(final String refreshToken) {
            this.refreshToken = refreshToken;
            return this;
        }
        public RefreshTokenRequest build() {
            return new RefreshTokenRequest(this.refreshToken);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "RefreshTokenRequest.RefreshTokenRequestBuilder(refreshToken=" + this.refreshToken + ")";
        }
    }
    public static RefreshTokenRequest.RefreshTokenRequestBuilder builder() {
        return new RefreshTokenRequest.RefreshTokenRequestBuilder();
    }
    public String getRefreshToken() {
        return this.refreshToken;
    }
    public void setRefreshToken(final String refreshToken) {
        this.refreshToken = refreshToken;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof RefreshTokenRequest)) return false;
        final RefreshTokenRequest other = (RefreshTokenRequest) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$refreshToken = this.getRefreshToken();
        final java.lang.Object other$refreshToken = other.getRefreshToken();
        if (this$refreshToken == null ? other$refreshToken != null : !this$refreshToken.equals(other$refreshToken)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof RefreshTokenRequest;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $refreshToken = this.getRefreshToken();
        result = result * PRIME + ($refreshToken == null ? 43 : $refreshToken.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "RefreshTokenRequest(refreshToken=" + this.getRefreshToken() + ")";
    }
    public RefreshTokenRequest() {
    }
    public RefreshTokenRequest(final String refreshToken) {
        this.refreshToken = refreshToken;
    }
}

