package com.smart_cafe_ai.identity_service.dto.admin;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.identity_service.model.UserStatus;

public class AdminUserCreateRequest {
    @JsonProperty("full_name")
    private String fullName;
    private String email;
    private String phone;
    private String password;
    @JsonProperty("role_id")
    private Integer roleId;
    @JsonProperty("branch_id")
    private Integer branchId;
    private UserStatus status;

    public AdminUserCreateRequest() {
    }

    public AdminUserCreateRequest(
            String fullName,
            String email,
            String phone,
            String password,
            Integer roleId,
            Integer branchId,
            UserStatus status
    ) {
        this.fullName = fullName;
        this.email = email;
        this.phone = phone;
        this.password = password;
        this.roleId = roleId;
        this.branchId = branchId;
        this.status = status;
    }

    public static AdminUserCreateRequestBuilder builder() {
        return new AdminUserCreateRequestBuilder();
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public Integer getRoleId() {
        return roleId;
    }

    public void setRoleId(Integer roleId) {
        this.roleId = roleId;
    }

    public Integer getBranchId() {
        return branchId;
    }

    public void setBranchId(Integer branchId) {
        this.branchId = branchId;
    }

    public UserStatus getStatus() {
        return status;
    }

    public void setStatus(UserStatus status) {
        this.status = status;
    }

    public static class AdminUserCreateRequestBuilder {
        private String fullName;
        private String email;
        private String phone;
        private String password;
        private Integer roleId;
        private Integer branchId;
        private UserStatus status;

        public AdminUserCreateRequestBuilder fullName(String fullName) {
            this.fullName = fullName;
            return this;
        }

        public AdminUserCreateRequestBuilder email(String email) {
            this.email = email;
            return this;
        }

        public AdminUserCreateRequestBuilder phone(String phone) {
            this.phone = phone;
            return this;
        }

        public AdminUserCreateRequestBuilder password(String password) {
            this.password = password;
            return this;
        }

        public AdminUserCreateRequestBuilder roleId(Integer roleId) {
            this.roleId = roleId;
            return this;
        }

        public AdminUserCreateRequestBuilder branchId(Integer branchId) {
            this.branchId = branchId;
            return this;
        }

        public AdminUserCreateRequestBuilder status(UserStatus status) {
            this.status = status;
            return this;
        }

        public AdminUserCreateRequest build() {
            return new AdminUserCreateRequest(fullName, email, phone, password, roleId, branchId, status);
        }
    }
}

