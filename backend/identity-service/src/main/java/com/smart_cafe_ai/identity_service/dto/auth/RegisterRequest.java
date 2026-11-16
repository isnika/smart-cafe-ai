package com.smart_cafe_ai.identity_service.dto.auth;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.smart_cafe_ai.identity_service.dto.StrictStringDeserializer;

public class RegisterRequest {
    @JsonProperty("full_name")
    @JsonAlias({"full_name", "fullName"})
    @JsonDeserialize(using = StrictStringDeserializer.class)
    private String fullName;
    @JsonDeserialize(using = StrictStringDeserializer.class)
    private String email;
    @JsonDeserialize(using = StrictStringDeserializer.class)
    private String phone;
    @JsonDeserialize(using = StrictStringDeserializer.class)
    private String password;
    public static class RegisterRequestBuilder {
        private String fullName;
        private String email;
        private String phone;
        private String password;
        RegisterRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("full_name")
        @JsonAlias({"full_name", "fullName"})
        public RegisterRequest.RegisterRequestBuilder fullName(final String fullName) {
            this.fullName = fullName;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public RegisterRequest.RegisterRequestBuilder email(final String email) {
            this.email = email;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public RegisterRequest.RegisterRequestBuilder phone(final String phone) {
            this.phone = phone;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public RegisterRequest.RegisterRequestBuilder password(final String password) {
            this.password = password;
            return this;
        }
        public RegisterRequest build() {
            return new RegisterRequest(this.fullName, this.email, this.phone, this.password);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "RegisterRequest.RegisterRequestBuilder(fullName=" + this.fullName + ", email=" + this.email + ", phone=" + this.phone + ", password=" + this.password + ")";
        }
    }
    public static RegisterRequest.RegisterRequestBuilder builder() {
        return new RegisterRequest.RegisterRequestBuilder();
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

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof RegisterRequest)) return false;
        final RegisterRequest other = (RegisterRequest) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
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
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof RegisterRequest;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $fullName = this.getFullName();
        result = result * PRIME + ($fullName == null ? 43 : $fullName.hashCode());
        final java.lang.Object $email = this.getEmail();
        result = result * PRIME + ($email == null ? 43 : $email.hashCode());
        final java.lang.Object $phone = this.getPhone();
        result = result * PRIME + ($phone == null ? 43 : $phone.hashCode());
        final java.lang.Object $password = this.getPassword();
        result = result * PRIME + ($password == null ? 43 : $password.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "RegisterRequest(fullName=" + this.getFullName() + ", email=" + this.getEmail() + ", phone=" + this.getPhone() + ", password=" + this.getPassword() + ")";
    }
    public RegisterRequest() {
    }
    public RegisterRequest(final String fullName, final String email, final String phone, final String password) {
        this.fullName = fullName;
        this.email = email;
        this.phone = phone;
        this.password = password;
    }
}

