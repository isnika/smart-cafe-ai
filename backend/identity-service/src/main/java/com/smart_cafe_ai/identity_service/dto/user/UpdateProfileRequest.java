package com.smart_cafe_ai.identity_service.dto.user;

import com.fasterxml.jackson.annotation.JsonProperty;

public class UpdateProfileRequest {
    @JsonProperty("full_name")
    private String fullName;
    private String avatar;
    public static class UpdateProfileRequestBuilder {
        private String fullName;
        private String avatar;
        UpdateProfileRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("full_name")
        public UpdateProfileRequest.UpdateProfileRequestBuilder fullName(final String fullName) {
            this.fullName = fullName;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public UpdateProfileRequest.UpdateProfileRequestBuilder avatar(final String avatar) {
            this.avatar = avatar;
            return this;
        }
        public UpdateProfileRequest build() {
            return new UpdateProfileRequest(this.fullName, this.avatar);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "UpdateProfileRequest.UpdateProfileRequestBuilder(fullName=" + this.fullName + ", avatar=" + this.avatar + ")";
        }
    }
    public static UpdateProfileRequest.UpdateProfileRequestBuilder builder() {
        return new UpdateProfileRequest.UpdateProfileRequestBuilder();
    }
    public String getFullName() {
        return this.fullName;
    }
    public String getAvatar() {
        return this.avatar;
    }
    public void setFullName(final String fullName) {
        this.fullName = fullName;
    }
    public void setAvatar(final String avatar) {
        this.avatar = avatar;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof UpdateProfileRequest)) return false;
        final UpdateProfileRequest other = (UpdateProfileRequest) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$fullName = this.getFullName();
        final java.lang.Object other$fullName = other.getFullName();
        if (this$fullName == null ? other$fullName != null : !this$fullName.equals(other$fullName)) return false;
        final java.lang.Object this$avatar = this.getAvatar();
        final java.lang.Object other$avatar = other.getAvatar();
        if (this$avatar == null ? other$avatar != null : !this$avatar.equals(other$avatar)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof UpdateProfileRequest;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $fullName = this.getFullName();
        result = result * PRIME + ($fullName == null ? 43 : $fullName.hashCode());
        final java.lang.Object $avatar = this.getAvatar();
        result = result * PRIME + ($avatar == null ? 43 : $avatar.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "UpdateProfileRequest(fullName=" + this.getFullName() + ", avatar=" + this.getAvatar() + ")";
    }
    public UpdateProfileRequest() {
    }
    public UpdateProfileRequest(final String fullName, final String avatar) {
        this.fullName = fullName;
        this.avatar = avatar;
    }
}

