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
    public static class ChangePasswordRequestBuilder {
        private String currentPassword;
        private String newPassword;
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

        public ChangePasswordRequest build() {
            return new ChangePasswordRequest(this.currentPassword, this.newPassword);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "ChangePasswordRequest.ChangePasswordRequestBuilder(currentPassword=[PROTECTED], newPassword=[PROTECTED])";
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
    public void setCurrentPassword(final String currentPassword) {
        this.currentPassword = currentPassword;
    }
    public void setNewPassword(final String newPassword) {
        this.newPassword = newPassword;
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
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "ChangePasswordRequest(currentPassword=[PROTECTED], newPassword=[PROTECTED])";
    }
    public ChangePasswordRequest() {
    }
    public ChangePasswordRequest(final String currentPassword, final String newPassword) {
        this.currentPassword = currentPassword;
        this.newPassword = newPassword;
    }
}

