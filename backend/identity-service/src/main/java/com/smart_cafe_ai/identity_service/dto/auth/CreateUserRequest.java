package com.smart_cafe_ai.identity_service.dto.auth;

public class CreateUserRequest {
    private String fullName;
    private String email;
    private String phone;
    private String password;
    private String roleName;
    private Integer branchId;
    public static class CreateUserRequestBuilder {
        private String fullName;
        private String email;
        private String phone;
        private String password;
        private String roleName;
        private Integer branchId;
        CreateUserRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public CreateUserRequest.CreateUserRequestBuilder fullName(final String fullName) {
            this.fullName = fullName;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public CreateUserRequest.CreateUserRequestBuilder email(final String email) {
            this.email = email;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public CreateUserRequest.CreateUserRequestBuilder phone(final String phone) {
            this.phone = phone;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public CreateUserRequest.CreateUserRequestBuilder password(final String password) {
            this.password = password;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public CreateUserRequest.CreateUserRequestBuilder roleName(final String roleName) {
            this.roleName = roleName;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public CreateUserRequest.CreateUserRequestBuilder branchId(final Integer branchId) {
            this.branchId = branchId;
            return this;
        }
        public CreateUserRequest build() {
            return new CreateUserRequest(this.fullName, this.email, this.phone, this.password, this.roleName, this.branchId);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "CreateUserRequest.CreateUserRequestBuilder(fullName=" + this.fullName + ", email=" + this.email + ", phone=" + this.phone + ", password=" + this.password + ", roleName=" + this.roleName + ", branchId=" + this.branchId + ")";
        }
    }
    public static CreateUserRequest.CreateUserRequestBuilder builder() {
        return new CreateUserRequest.CreateUserRequestBuilder();
    }
    public String getFullName() {
        return this.fullName;
    }
    public String getEmail() {
        return this.email;
    }
    public String getPhone() {
        return this.phone;
    }
    public String getPassword() {
        return this.password;
    }
    public String getRoleName() {
        return this.roleName;
    }
    public Integer getBranchId() {
        return this.branchId;
    }
    public void setFullName(final String fullName) {
        this.fullName = fullName;
    }
    public void setEmail(final String email) {
        this.email = email;
    }
    public void setPhone(final String phone) {
        this.phone = phone;
    }
    public void setPassword(final String password) {
        this.password = password;
    }
    public void setRoleName(final String roleName) {
        this.roleName = roleName;
    }
    public void setBranchId(final Integer branchId) {
        this.branchId = branchId;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof CreateUserRequest)) return false;
        final CreateUserRequest other = (CreateUserRequest) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$branchId = this.getBranchId();
        final java.lang.Object other$branchId = other.getBranchId();
        if (this$branchId == null ? other$branchId != null : !this$branchId.equals(other$branchId)) return false;
        final java.lang.Object this$fullName = this.getFullName();
        final java.lang.Object other$fullName = other.getFullName();
        if (this$fullName == null ? other$fullName != null : !this$fullName.equals(other$fullName)) return false;
        final java.lang.Object this$email = this.getEmail();
        final java.lang.Object other$email = other.getEmail();
        if (this$email == null ? other$email != null : !this$email.equals(other$email)) return false;
        final java.lang.Object this$phone = this.getPhone();
        final java.lang.Object other$phone = other.getPhone();
        if (this$phone == null ? other$phone != null : !this$phone.equals(other$phone)) return false;
        final java.lang.Object this$password = this.getPassword();
        final java.lang.Object other$password = other.getPassword();
        if (this$password == null ? other$password != null : !this$password.equals(other$password)) return false;
        final java.lang.Object this$roleName = this.getRoleName();
        final java.lang.Object other$roleName = other.getRoleName();
        if (this$roleName == null ? other$roleName != null : !this$roleName.equals(other$roleName)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof CreateUserRequest;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $branchId = this.getBranchId();
        result = result * PRIME + ($branchId == null ? 43 : $branchId.hashCode());
        final java.lang.Object $fullName = this.getFullName();
        result = result * PRIME + ($fullName == null ? 43 : $fullName.hashCode());
        final java.lang.Object $email = this.getEmail();
        result = result * PRIME + ($email == null ? 43 : $email.hashCode());
        final java.lang.Object $phone = this.getPhone();
        result = result * PRIME + ($phone == null ? 43 : $phone.hashCode());
        final java.lang.Object $password = this.getPassword();
        result = result * PRIME + ($password == null ? 43 : $password.hashCode());
        final java.lang.Object $roleName = this.getRoleName();
        result = result * PRIME + ($roleName == null ? 43 : $roleName.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "CreateUserRequest(fullName=" + this.getFullName() + ", email=" + this.getEmail() + ", phone=" + this.getPhone() + ", password=" + this.getPassword() + ", roleName=" + this.getRoleName() + ", branchId=" + this.getBranchId() + ")";
    }
    public CreateUserRequest() {
    }
    public CreateUserRequest(final String fullName, final String email, final String phone, final String password, final String roleName, final Integer branchId) {
        this.fullName = fullName;
        this.email = email;
        this.phone = phone;
        this.password = password;
        this.roleName = roleName;
        this.branchId = branchId;
    }
}

