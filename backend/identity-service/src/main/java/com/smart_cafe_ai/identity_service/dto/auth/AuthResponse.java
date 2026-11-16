package com.smart_cafe_ai.identity_service.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.smart_cafe_ai.identity_service.dto.user.UserResponse;

public class AuthResponse {
    @JsonProperty("access_token")
    private String accessToken;
    @JsonProperty("refresh_token")
    private String refreshToken;
    @JsonProperty("token_type")
    private String tokenType;
    @JsonProperty("expires_in")
    private Long expiresIn;
    private UserResponse user;
    @JsonProperty("is_new_user")
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Boolean newUser;

    public Boolean getNewUser() {
        return newUser;
    }

    public void setNewUser(Boolean newUser) {
        this.newUser = newUser;
    }
    private static String $default$tokenType() {
        return "Bearer";
    }
    public static class AuthResponseBuilder {
        private String accessToken;
        private String refreshToken;
        private boolean tokenType$set;
        private String tokenType$value;
        private Long expiresIn;
        private UserResponse user;
        AuthResponseBuilder() {
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("access_token")
        public AuthResponse.AuthResponseBuilder accessToken(final String accessToken) {
            this.accessToken = accessToken;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("refresh_token")
        public AuthResponse.AuthResponseBuilder refreshToken(final String refreshToken) {
            this.refreshToken = refreshToken;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("token_type")
        public AuthResponse.AuthResponseBuilder tokenType(final String tokenType) {
            this.tokenType$value = tokenType;
            tokenType$set = true;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("expires_in")
        public AuthResponse.AuthResponseBuilder expiresIn(final Long expiresIn) {
            this.expiresIn = expiresIn;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AuthResponse.AuthResponseBuilder user(final UserResponse user) {
            this.user = user;
            return this;
        }
        public AuthResponse build() {
            String tokenType$value = this.tokenType$value;
            if (!this.tokenType$set) tokenType$value = AuthResponse.$default$tokenType();
            return new AuthResponse(this.accessToken, this.refreshToken, tokenType$value, this.expiresIn, this.user);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "AuthResponse.AuthResponseBuilder(accessToken=" + this.accessToken + ", refreshToken=" + this.refreshToken + ", tokenType$value=" + this.tokenType$value + ", expiresIn=" + this.expiresIn + ", user=" + this.user + ")";
        }
    }
    public static AuthResponse.AuthResponseBuilder builder() {
        return new AuthResponse.AuthResponseBuilder();
    }
    public String getAccessToken() {
        return this.accessToken;
    }
    public String getRefreshToken() {
        return this.refreshToken;
    }
    public String getTokenType() {
        return this.tokenType;
    }
    public Long getExpiresIn() {
        return this.expiresIn;
    }
    public UserResponse getUser() {
        return this.user;
    }
    public void setAccessToken(final String accessToken) {
        this.accessToken = accessToken;
    }
    public void setRefreshToken(final String refreshToken) {
        this.refreshToken = refreshToken;
    }
    public void setTokenType(final String tokenType) {
        this.tokenType = tokenType;
    }
    public void setExpiresIn(final Long expiresIn) {
        this.expiresIn = expiresIn;
    }
    public void setUser(final UserResponse user) {
        this.user = user;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof AuthResponse)) return false;
        final AuthResponse other = (AuthResponse) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        if (!java.util.Objects.equals(this.newUser, other.newUser)) return false;
        final java.lang.Object this$expiresIn = this.getExpiresIn();
        final java.lang.Object other$expiresIn = other.getExpiresIn();
        if (this$expiresIn == null ? other$expiresIn != null : !this$expiresIn.equals(other$expiresIn)) return false;
        final java.lang.Object this$accessToken = this.getAccessToken();
        final java.lang.Object other$accessToken = other.getAccessToken();
        if (this$accessToken == null ? other$accessToken != null : !this$accessToken.equals(other$accessToken)) return false;
        final java.lang.Object this$refreshToken = this.getRefreshToken();
        final java.lang.Object other$refreshToken = other.getRefreshToken();
        if (this$refreshToken == null ? other$refreshToken != null : !this$refreshToken.equals(other$refreshToken)) return false;
        final java.lang.Object this$tokenType = this.getTokenType();
        final java.lang.Object other$tokenType = other.getTokenType();
        if (this$tokenType == null ? other$tokenType != null : !this$tokenType.equals(other$tokenType)) return false;
        final java.lang.Object this$user = this.getUser();
        final java.lang.Object other$user = other.getUser();
        if (this$user == null ? other$user != null : !this$user.equals(other$user)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof AuthResponse;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        result = PRIME * result + java.util.Objects.hashCode(newUser);
        final java.lang.Object $expiresIn = this.getExpiresIn();
        result = result * PRIME + ($expiresIn == null ? 43 : $expiresIn.hashCode());
        final java.lang.Object $accessToken = this.getAccessToken();
        result = result * PRIME + ($accessToken == null ? 43 : $accessToken.hashCode());
        final java.lang.Object $refreshToken = this.getRefreshToken();
        result = result * PRIME + ($refreshToken == null ? 43 : $refreshToken.hashCode());
        final java.lang.Object $tokenType = this.getTokenType();
        result = result * PRIME + ($tokenType == null ? 43 : $tokenType.hashCode());
        final java.lang.Object $user = this.getUser();
        result = result * PRIME + ($user == null ? 43 : $user.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "AuthResponse(accessToken=" + this.getAccessToken() + ", refreshToken=" + this.getRefreshToken() + ", tokenType=" + this.getTokenType() + ", expiresIn=" + this.getExpiresIn() + ", user=" + this.getUser() + ")";
    }
    public AuthResponse() {
        this.tokenType = AuthResponse.$default$tokenType();
    }
    public AuthResponse(final String accessToken, final String refreshToken, final String tokenType, final Long expiresIn, final UserResponse user) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.tokenType = tokenType;
        this.expiresIn = expiresIn;
        this.user = user;
    }
}

