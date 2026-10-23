package com.smart_cafe_ai.identity_service.dto.user;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.smart_cafe_ai.identity_service.dto.StrictStringDeserializer;

public class UpdateContactRequest {
    // email/phone alone are the new value; with new_email/new_phone they are the current value.
    @JsonDeserialize(using = StrictStringDeserializer.class)
    private String email;
    @JsonDeserialize(using = StrictStringDeserializer.class)
    private String phone;
    @JsonAlias("newEmail")
    @JsonProperty("new_email")
    @JsonDeserialize(using = StrictStringDeserializer.class)
    private String newEmail;
    @JsonAlias("newPhone")
    @JsonProperty("new_phone")
    @JsonDeserialize(using = StrictStringDeserializer.class)
    private String newPhone;
    @JsonAlias("otpCode")
    @JsonProperty("otp_code")
    @JsonDeserialize(using = StrictStringDeserializer.class)
    private String otpCode;
    public static class UpdateContactRequestBuilder {
        private String email;
        private String phone;
        private String newEmail;
        private String newPhone;
        private String otpCode;
        UpdateContactRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public UpdateContactRequest.UpdateContactRequestBuilder email(final String email) {
            this.email = email;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public UpdateContactRequest.UpdateContactRequestBuilder phone(final String phone) {
            this.phone = phone;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonAlias("newEmail")
        @JsonProperty("new_email")
        public UpdateContactRequest.UpdateContactRequestBuilder newEmail(final String newEmail) {
            this.newEmail = newEmail;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonAlias("newPhone")
        @JsonProperty("new_phone")
        public UpdateContactRequest.UpdateContactRequestBuilder newPhone(final String newPhone) {
            this.newPhone = newPhone;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonAlias("otpCode")
        @JsonProperty("otp_code")
        public UpdateContactRequest.UpdateContactRequestBuilder otpCode(final String otpCode) {
            this.otpCode = otpCode;
            return this;
        }
        public UpdateContactRequest build() {
            return new UpdateContactRequest(this.email, this.phone, this.newEmail, this.newPhone, this.otpCode);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "UpdateContactRequest.UpdateContactRequestBuilder(email=" + this.email + ", phone=" + this.phone + ", newEmail=" + this.newEmail + ", newPhone=" + this.newPhone + ", otpCode=" + this.otpCode + ")";
        }
    }
    public static UpdateContactRequest.UpdateContactRequestBuilder builder() {
        return new UpdateContactRequest.UpdateContactRequestBuilder();
    }
    public String getEmail() {
        return this.email;
    }
    public String getPhone() {
        return this.phone;
    }
    public String getNewEmail() {
        return this.newEmail;
    }
    public String getNewPhone() {
        return this.newPhone;
    }
    public String getOtpCode() {
        return this.otpCode;
    }
    public void setEmail(final String email) {
        this.email = email;
    }
    public void setPhone(final String phone) {
        this.phone = phone;
    }
    public void setNewEmail(final String newEmail) {
        this.newEmail = newEmail;
    }
    public void setNewPhone(final String newPhone) {
        this.newPhone = newPhone;
    }
    public void setOtpCode(final String otpCode) {
        this.otpCode = otpCode;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof UpdateContactRequest)) return false;
        final UpdateContactRequest other = (UpdateContactRequest) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$email = this.getEmail();
        final java.lang.Object other$email = other.getEmail();
        if (this$email == null ? other$email != null : !this$email.equals(other$email)) return false;
        final java.lang.Object this$phone = this.getPhone();
        final java.lang.Object other$phone = other.getPhone();
        if (this$phone == null ? other$phone != null : !this$phone.equals(other$phone)) return false;
        final java.lang.Object this$newEmail = this.getNewEmail();
        final java.lang.Object other$newEmail = other.getNewEmail();
        if (this$newEmail == null ? other$newEmail != null : !this$newEmail.equals(other$newEmail)) return false;
        final java.lang.Object this$newPhone = this.getNewPhone();
        final java.lang.Object other$newPhone = other.getNewPhone();
        if (this$newPhone == null ? other$newPhone != null : !this$newPhone.equals(other$newPhone)) return false;
        final java.lang.Object this$otpCode = this.getOtpCode();
        final java.lang.Object other$otpCode = other.getOtpCode();
        if (this$otpCode == null ? other$otpCode != null : !this$otpCode.equals(other$otpCode)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof UpdateContactRequest;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $email = this.getEmail();
        result = result * PRIME + ($email == null ? 43 : $email.hashCode());
        final java.lang.Object $phone = this.getPhone();
        result = result * PRIME + ($phone == null ? 43 : $phone.hashCode());
        final java.lang.Object $newEmail = this.getNewEmail();
        result = result * PRIME + ($newEmail == null ? 43 : $newEmail.hashCode());
        final java.lang.Object $newPhone = this.getNewPhone();
        result = result * PRIME + ($newPhone == null ? 43 : $newPhone.hashCode());
        final java.lang.Object $otpCode = this.getOtpCode();
        result = result * PRIME + ($otpCode == null ? 43 : $otpCode.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "UpdateContactRequest(email=" + this.getEmail() + ", phone=" + this.getPhone() + ", newEmail=" + this.getNewEmail() + ", newPhone=" + this.getNewPhone() + ", otpCode=" + this.getOtpCode() + ")";
    }
    public UpdateContactRequest() {
    }
    public UpdateContactRequest(final String email, final String phone, final String newEmail, final String newPhone, final String otpCode) {
        this.email = email;
        this.phone = phone;
        this.newEmail = newEmail;
        this.newPhone = newPhone;
        this.otpCode = otpCode;
    }
}

