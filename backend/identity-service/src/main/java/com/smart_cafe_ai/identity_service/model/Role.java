package com.smart_cafe_ai.identity_service.model;

import jakarta.persistence.*;

@Entity
@Table(name = "Roles")
public class Role {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @Column(nullable = false, unique = true, length = 50)
    private String name;
    @Column(length = 255)
    private String description;
    public static class RoleBuilder {
        private Integer id;
        private String name;
        private String description;
        RoleBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public Role.RoleBuilder id(final Integer id) {
            this.id = id;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public Role.RoleBuilder name(final String name) {
            this.name = name;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public Role.RoleBuilder description(final String description) {
            this.description = description;
            return this;
        }
        public Role build() {
            return new Role(this.id, this.name, this.description);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "Role.RoleBuilder(id=" + this.id + ", name=" + this.name + ", description=" + this.description + ")";
        }
    }
    public static Role.RoleBuilder builder() {
        return new Role.RoleBuilder();
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
    public void setId(final Integer id) {
        this.id = id;
    }
    public void setName(final String name) {
        this.name = name;
    }
    public void setDescription(final String description) {
        this.description = description;
    }
    public Role() {
    }
    public Role(final Integer id, final String name, final String description) {
        this.id = id;
        this.name = name;
        this.description = description;
    }
}

