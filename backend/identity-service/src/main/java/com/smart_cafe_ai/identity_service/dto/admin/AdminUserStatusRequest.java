package com.smart_cafe_ai.identity_service.dto.admin;

import com.smart_cafe_ai.identity_service.model.UserStatus;

public class AdminUserStatusRequest {
    private UserStatus status;
    public static class AdminUserStatusRequestBuilder {
        private UserStatus status;
        AdminUserStatusRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public AdminUserStatusRequest.AdminUserStatusRequestBuilder status(final UserStatus status) {
            this.status = status;
            return this;
        }
        public AdminUserStatusRequest build() {
            return new AdminUserStatusRequest(this.status);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "AdminUserStatusRequest.AdminUserStatusRequestBuilder(status=" + this.status + ")";
        }
    }
    public static AdminUserStatusRequest.AdminUserStatusRequestBuilder builder() {
        return new AdminUserStatusRequest.AdminUserStatusRequestBuilder();
    }
    public UserStatus getStatus() {
        return this.status;
    }
    public void setStatus(final UserStatus status) {
        this.status = status;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof AdminUserStatusRequest)) return false;
        final AdminUserStatusRequest other = (AdminUserStatusRequest) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$status = this.getStatus();
        final java.lang.Object other$status = other.getStatus();
        if (this$status == null ? other$status != null : !this$status.equals(other$status)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof AdminUserStatusRequest;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $status = this.getStatus();
        result = result * PRIME + ($status == null ? 43 : $status.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "AdminUserStatusRequest(status=" + this.getStatus() + ")";
    }
    public AdminUserStatusRequest() {
    }
    public AdminUserStatusRequest(final UserStatus status) {
        this.status = status;
    }
}

