package com.smart_cafe_ai.identity_service.dto.staff;

import com.fasterxml.jackson.annotation.JsonProperty;

public class StaffCreateRequest {
    @JsonProperty("full_name")
    private String fullName;
    private String email;
    private String phone;
    private String password;
    @JsonProperty("branch_id")
    private Integer branchId;
    private String avatar;
    public static class StaffCreateRequestBuilder {
        private String fullName;
        private String email;
        private String phone;
        private String password;
        private Integer branchId;
        private String avatar;
        StaffCreateRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("full_name")
        public StaffCreateRequest.StaffCreateRequestBuilder fullName(final String fullName) {
            this.fullName = fullName;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public StaffCreateRequest.StaffCreateRequestBuilder email(final String email) {
            this.email = email;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public StaffCreateRequest.StaffCreateRequestBuilder phone(final String phone) {
            this.phone = phone;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public StaffCreateRequest.StaffCreateRequestBuilder password(final String password) {
            this.password = password;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("branch_id")
        public StaffCreateRequest.StaffCreateRequestBuilder branchId(final Integer branchId) {
            this.branchId = branchId;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public StaffCreateRequest.StaffCreateRequestBuilder avatar(final String avatar) {
            this.avatar = avatar;
            return this;
        }
        public StaffCreateRequest build() {
            return new StaffCreateRequest(this.fullName, this.email, this.phone, this.password, this.branchId, this.avatar);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "StaffCreateRequest.StaffCreateRequestBuilder(fullName=" + this.fullName + ", email=" + this.email + ", phone=" + this.phone + ", password=" + this.password + ", branchId=" + this.branchId + ", avatar=" + this.avatar + ")";
        }
    }
    public static StaffCreateRequest.StaffCreateRequestBuilder builder() {
        return new StaffCreateRequest.StaffCreateRequestBuilder();
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
    public Integer getBranchId() {
        return this.branchId;
    }
    public String getAvatar() {
        return this.avatar;
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
    public void setBranchId(final Integer branchId) {
        this.branchId = branchId;
    }
    public void setAvatar(final String avatar) {
        this.avatar = avatar;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof StaffCreateRequest)) return false;
        final StaffCreateRequest other = (StaffCreateRequest) o;
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
        final java.lang.Object this$avatar = this.getAvatar();
        final java.lang.Object other$avatar = other.getAvatar();
        if (this$avatar == null ? other$avatar != null : !this$avatar.equals(other$avatar)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof StaffCreateRequest;
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
        final java.lang.Object $avatar = this.getAvatar();
        result = result * PRIME + ($avatar == null ? 43 : $avatar.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "StaffCreateRequest(fullName=" + this.getFullName() + ", email=" + this.getEmail() + ", phone=" + this.getPhone() + ", password=" + this.getPassword() + ", branchId=" + this.getBranchId() + ", avatar=" + this.getAvatar() + ")";
    }
    public StaffCreateRequest() {
    }
    public StaffCreateRequest(final String fullName, final String email, final String phone, final String password, final Integer branchId, final String avatar) {
        this.fullName = fullName;
        this.email = email;
        this.phone = phone;
        this.password = password;
        this.branchId = branchId;
        this.avatar = avatar;
    }
}

