package com.smart_cafe_ai.identity_service.dto.role;

public class RoleRequest {
    private String name;
    private String description;
    public static class RoleRequestBuilder {
        private String name;
        private String description;
        RoleRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public RoleRequest.RoleRequestBuilder name(final String name) {
            this.name = name;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public RoleRequest.RoleRequestBuilder description(final String description) {
            this.description = description;
            return this;
        }
        public RoleRequest build() {
            return new RoleRequest(this.name, this.description);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "RoleRequest.RoleRequestBuilder(name=" + this.name + ", description=" + this.description + ")";
        }
    }
    public static RoleRequest.RoleRequestBuilder builder() {
        return new RoleRequest.RoleRequestBuilder();
    }
    public String getName() {
        return this.name;
    }
    public String getDescription() {
        return this.description;
    }
    public void setName(final String name) {
        this.name = name;
    }
    public void setDescription(final String description) {
        this.description = description;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof RoleRequest)) return false;
        final RoleRequest other = (RoleRequest) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$name = this.getName();
        final java.lang.Object other$name = other.getName();
        if (this$name == null ? other$name != null : !this$name.equals(other$name)) return false;
        final java.lang.Object this$description = this.getDescription();
        final java.lang.Object other$description = other.getDescription();
        if (this$description == null ? other$description != null : !this$description.equals(other$description)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof RoleRequest;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $name = this.getName();
        result = result * PRIME + ($name == null ? 43 : $name.hashCode());
        final java.lang.Object $description = this.getDescription();
        result = result * PRIME + ($description == null ? 43 : $description.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "RoleRequest(name=" + this.getName() + ", description=" + this.getDescription() + ")";
    }
    public RoleRequest() {
    }
    public RoleRequest(final String name, final String description) {
        this.name = name;
        this.description = description;
    }
}

