package com.smart_cafe_ai.identity_service.dto.auth;

public class LoginRequest {
    private String identifier;
    private String password;
    public static class LoginRequestBuilder {
        private String identifier;
        private String password;
        LoginRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public LoginRequest.LoginRequestBuilder identifier(final String identifier) {
            this.identifier = identifier;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public LoginRequest.LoginRequestBuilder password(final String password) {
            this.password = password;
            return this;
        }
        public LoginRequest build() {
            return new LoginRequest(this.identifier, this.password);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "LoginRequest.LoginRequestBuilder(identifier=" + this.identifier + ", password=" + this.password + ")";
        }
    }
    public static LoginRequest.LoginRequestBuilder builder() {
        return new LoginRequest.LoginRequestBuilder();
    }
    public String getIdentifier() {
        return this.identifier;
    }
    public String getPassword() {
        return this.password;
    }
    public void setIdentifier(final String identifier) {
        this.identifier = identifier;
    }
    public void setPassword(final String password) {
        this.password = password;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof LoginRequest)) return false;
        final LoginRequest other = (LoginRequest) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$identifier = this.getIdentifier();
        final java.lang.Object other$identifier = other.getIdentifier();
        if (this$identifier == null ? other$identifier != null : !this$identifier.equals(other$identifier)) return false;
        final java.lang.Object this$password = this.getPassword();
        final java.lang.Object other$password = other.getPassword();
        if (this$password == null ? other$password != null : !this$password.equals(other$password)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof LoginRequest;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $identifier = this.getIdentifier();
        result = result * PRIME + ($identifier == null ? 43 : $identifier.hashCode());
        final java.lang.Object $password = this.getPassword();
        result = result * PRIME + ($password == null ? 43 : $password.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "LoginRequest(identifier=" + this.getIdentifier() + ", password=" + this.getPassword() + ")";
    }
    public LoginRequest() {
    }
    public LoginRequest(final String identifier, final String password) {
        this.identifier = identifier;
        this.password = password;
    }
}

