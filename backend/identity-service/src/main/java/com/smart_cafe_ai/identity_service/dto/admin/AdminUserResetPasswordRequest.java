package com.smart_cafe_ai.identity_service.dto.admin;

import com.fasterxml.jackson.annotation.JsonProperty;

public class AdminUserResetPasswordRequest {
    @JsonProperty("new_password")
    private String newPassword;
    public static class AdminUserResetPasswordRequestBuilder {
        private String newPassword;
        AdminUserResetPasswordRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("new_password")
        public AdminUserResetPasswordRequest.AdminUserResetPasswordRequestBuilder newPassword(final String newPassword) {
            this.newPassword = newPassword;
            return this;
        }
        public AdminUserResetPasswordRequest build() {
            return new AdminUserResetPasswordRequest(this.newPassword);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "AdminUserResetPasswordRequest.AdminUserResetPasswordRequestBuilder(newPassword=" + this.newPassword + ")";
        }
    }
    public static AdminUserResetPasswordRequest.AdminUserResetPasswordRequestBuilder builder() {
        return new AdminUserResetPasswordRequest.AdminUserResetPasswordRequestBuilder();
    }
    public String getNewPassword() {
        return this.newPassword;
    }
    public void setNewPassword(final String newPassword) {
        this.newPassword = newPassword;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof AdminUserResetPasswordRequest)) return false;
        final AdminUserResetPasswordRequest other = (AdminUserResetPasswordRequest) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$newPassword = this.getNewPassword();
        final java.lang.Object other$newPassword = other.getNewPassword();
        if (this$newPassword == null ? other$newPassword != null : !this$newPassword.equals(other$newPassword)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof AdminUserResetPasswordRequest;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $newPassword = this.getNewPassword();
        result = result * PRIME + ($newPassword == null ? 43 : $newPassword.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "AdminUserResetPasswordRequest(newPassword=" + this.getNewPassword() + ")";
    }
    public AdminUserResetPasswordRequest() {
    }
    public AdminUserResetPasswordRequest(final String newPassword) {
        this.newPassword = newPassword;
    }
}

