package com.smart_cafe_ai.identity_service.dto.staff;

import com.fasterxml.jackson.annotation.JsonProperty;

public class StaffUpdateRequest {
    @JsonProperty("full_name")
    private String fullName;
    private String email;
    private String phone;
    private String avatar;
    @JsonProperty("branch_id")
    private Integer branchId;
    public static class StaffUpdateRequestBuilder {
        private String fullName;
        private String email;
        private String phone;
        private String avatar;
        private Integer branchId;
        StaffUpdateRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("full_name")
        public StaffUpdateRequest.StaffUpdateRequestBuilder fullName(final String fullName) {
            this.fullName = fullName;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public StaffUpdateRequest.StaffUpdateRequestBuilder email(final String email) {
            this.email = email;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public StaffUpdateRequest.StaffUpdateRequestBuilder phone(final String phone) {
            this.phone = phone;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public StaffUpdateRequest.StaffUpdateRequestBuilder avatar(final String avatar) {
            this.avatar = avatar;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("branch_id")
        public StaffUpdateRequest.StaffUpdateRequestBuilder branchId(final Integer branchId) {
            this.branchId = branchId;
            return this;
        }
        public StaffUpdateRequest build() {
            return new StaffUpdateRequest(this.fullName, this.email, this.phone, this.avatar, this.branchId);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "StaffUpdateRequest.StaffUpdateRequestBuilder(fullName=" + this.fullName + ", email=" + this.email + ", phone=" + this.phone + ", avatar=" + this.avatar + ", branchId=" + this.branchId + ")";
        }
    }
    public static StaffUpdateRequest.StaffUpdateRequestBuilder builder() {
        return new StaffUpdateRequest.StaffUpdateRequestBuilder();
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
    public String getAvatar() {
        return this.avatar;
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
    public void setAvatar(final String avatar) {
        this.avatar = avatar;
    }
    public void setBranchId(final Integer branchId) {
        this.branchId = branchId;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof StaffUpdateRequest)) return false;
        final StaffUpdateRequest other = (StaffUpdateRequest) o;
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
        final java.lang.Object this$avatar = this.getAvatar();
        final java.lang.Object other$avatar = other.getAvatar();
        if (this$avatar == null ? other$avatar != null : !this$avatar.equals(other$avatar)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof StaffUpdateRequest;
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
        final java.lang.Object $avatar = this.getAvatar();
        result = result * PRIME + ($avatar == null ? 43 : $avatar.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "StaffUpdateRequest(fullName=" + this.getFullName() + ", email=" + this.getEmail() + ", phone=" + this.getPhone() + ", avatar=" + this.getAvatar() + ", branchId=" + this.getBranchId() + ")";
    }
    public StaffUpdateRequest() {
    }
    public StaffUpdateRequest(final String fullName, final String email, final String phone, final String avatar, final Integer branchId) {
        this.fullName = fullName;
        this.email = email;
        this.phone = phone;
        this.avatar = avatar;
        this.branchId = branchId;
    }
}

