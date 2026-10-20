package com.smart_cafe_ai.identity_service.dto.role;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.identity_service.model.Role;

public class RoleResponse {
    private Integer id;
    private String name;
    private String description;
    @JsonProperty("user_count")
    private Long userCount;

    public static RoleResponse fromEntity(Role role, Long userCount) {
        if (role == null) {
            return null;
        }
        return RoleResponse.builder().id(role.getId()).name(role.getName()).description(role.getDescription()).userCount(userCount != null ? userCount : 0L).build();
    }
    public static class RoleResponseBuilder {
        private Integer id;
        private String name;
        private String description;
        private Long userCount;
        RoleResponseBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public RoleResponse.RoleResponseBuilder id(final Integer id) {
            this.id = id;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public RoleResponse.RoleResponseBuilder name(final String name) {
            this.name = name;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public RoleResponse.RoleResponseBuilder description(final String description) {
            this.description = description;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("user_count")
        public RoleResponse.RoleResponseBuilder userCount(final Long userCount) {
            this.userCount = userCount;
            return this;
        }
        public RoleResponse build() {
            return new RoleResponse(this.id, this.name, this.description, this.userCount);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "RoleResponse.RoleResponseBuilder(id=" + this.id + ", name=" + this.name + ", description=" + this.description + ", userCount=" + this.userCount + ")";
        }
    }
    public static RoleResponse.RoleResponseBuilder builder() {
        return new RoleResponse.RoleResponseBuilder();
    }
    public Integer getId() {
        return this.id;
    }
    public String getName() {
        return this.name;
    }
    public String getDescription() {
        return this.description;
    }
    public Long getUserCount() {
        return this.userCount;
    }
    public void setId(final Integer id) {
        this.id = id;
    }
    public void setName(final String name) {
        this.name = name;
    }
    public void setDescription(final String description) {
        this.description = description;
    }
    public void setUserCount(final Long userCount) {
        this.userCount = userCount;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof RoleResponse)) return false;
        final RoleResponse other = (RoleResponse) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$id = this.getId();
        final java.lang.Object other$id = other.getId();
        if (this$id == null ? other$id != null : !this$id.equals(other$id)) return false;
        final java.lang.Object this$userCount = this.getUserCount();
        final java.lang.Object other$userCount = other.getUserCount();
        if (this$userCount == null ? other$userCount != null : !this$userCount.equals(other$userCount)) return false;
        final java.lang.Object this$name = this.getName();
        final java.lang.Object other$name = other.getName();
        if (this$name == null ? other$name != null : !this$name.equals(other$name)) return false;
        final java.lang.Object this$description = this.getDescription();
        final java.lang.Object other$description = other.getDescription();
        if (this$description == null ? other$description != null : !this$description.equals(other$description)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof RoleResponse;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $id = this.getId();
        result = result * PRIME + ($id == null ? 43 : $id.hashCode());
        final java.lang.Object $userCount = this.getUserCount();
        result = result * PRIME + ($userCount == null ? 43 : $userCount.hashCode());
        final java.lang.Object $name = this.getName();
        result = result * PRIME + ($name == null ? 43 : $name.hashCode());
        final java.lang.Object $description = this.getDescription();
        result = result * PRIME + ($description == null ? 43 : $description.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "RoleResponse(id=" + this.getId() + ", name=" + this.getName() + ", description=" + this.getDescription() + ", userCount=" + this.getUserCount() + ")";
    }
    public RoleResponse() {
    }
    public RoleResponse(final Integer id, final String name, final String description, final Long userCount) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.userCount = userCount;
    }
}

