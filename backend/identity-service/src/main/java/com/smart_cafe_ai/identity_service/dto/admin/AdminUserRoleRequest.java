package com.smart_cafe_ai.identity_service.dto.admin;

import com.fasterxml.jackson.annotation.JsonProperty;

public class AdminUserRoleRequest {
    @JsonProperty("role_id")
    private Integer roleId;
    @JsonProperty("branch_id")
    private Integer branchId;
    public static class AdminUserRoleRequestBuilder {
        private Integer roleId;
        private Integer branchId;
        AdminUserRoleRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("role_id")
        public AdminUserRoleRequest.AdminUserRoleRequestBuilder roleId(final Integer roleId) {
            this.roleId = roleId;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("branch_id")
        public AdminUserRoleRequest.AdminUserRoleRequestBuilder branchId(final Integer branchId) {
            this.branchId = branchId;
            return this;
        }
        public AdminUserRoleRequest build() {
            return new AdminUserRoleRequest(this.roleId, this.branchId);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "AdminUserRoleRequest.AdminUserRoleRequestBuilder(roleId=" + this.roleId + ", branchId=" + this.branchId + ")";
        }
    }
    public static AdminUserRoleRequest.AdminUserRoleRequestBuilder builder() {
        return new AdminUserRoleRequest.AdminUserRoleRequestBuilder();
    }
    public Integer getRoleId() {
        return this.roleId;
    }
    public Integer getBranchId() {
        return this.branchId;
    }
    public void setRoleId(final Integer roleId) {
        this.roleId = roleId;
    }
    public void setBranchId(final Integer branchId) {
        this.branchId = branchId;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof AdminUserRoleRequest)) return false;
        final AdminUserRoleRequest other = (AdminUserRoleRequest) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$roleId = this.getRoleId();
        final java.lang.Object other$roleId = other.getRoleId();
        if (this$roleId == null ? other$roleId != null : !this$roleId.equals(other$roleId)) return false;
        final java.lang.Object this$branchId = this.getBranchId();
        final java.lang.Object other$branchId = other.getBranchId();
        if (this$branchId == null ? other$branchId != null : !this$branchId.equals(other$branchId)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof AdminUserRoleRequest;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $roleId = this.getRoleId();
        result = result * PRIME + ($roleId == null ? 43 : $roleId.hashCode());
        final java.lang.Object $branchId = this.getBranchId();
        result = result * PRIME + ($branchId == null ? 43 : $branchId.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "AdminUserRoleRequest(roleId=" + this.getRoleId() + ", branchId=" + this.getBranchId() + ")";
    }
    public AdminUserRoleRequest() {
    }
    public AdminUserRoleRequest(final Integer roleId, final Integer branchId) {
        this.roleId = roleId;
        this.branchId = branchId;
    }
}

