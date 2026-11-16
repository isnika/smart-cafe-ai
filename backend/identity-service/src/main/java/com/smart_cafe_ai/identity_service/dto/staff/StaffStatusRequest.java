package com.smart_cafe_ai.identity_service.dto.staff;

import com.smart_cafe_ai.identity_service.model.UserStatus;

public class StaffStatusRequest {
    private UserStatus status;
    public static class StaffStatusRequestBuilder {
        private UserStatus status;
        StaffStatusRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public StaffStatusRequest.StaffStatusRequestBuilder status(final UserStatus status) {
            this.status = status;
            return this;
        }
        public StaffStatusRequest build() {
            return new StaffStatusRequest(this.status);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "StaffStatusRequest.StaffStatusRequestBuilder(status=" + this.status + ")";
        }
    }
    public static StaffStatusRequest.StaffStatusRequestBuilder builder() {
        return new StaffStatusRequest.StaffStatusRequestBuilder();
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
        if (!(o instanceof StaffStatusRequest)) return false;
        final StaffStatusRequest other = (StaffStatusRequest) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$status = this.getStatus();
        final java.lang.Object other$status = other.getStatus();
        if (this$status == null ? other$status != null : !this$status.equals(other$status)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof StaffStatusRequest;
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
        return "StaffStatusRequest(status=" + this.getStatus() + ")";
    }
    public StaffStatusRequest() {
    }
    public StaffStatusRequest(final UserStatus status) {
        this.status = status;
    }
}

