package com.smart_cafe_ai.identity_service.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "Audit_Logs")
public class AuditLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "actor_user_id", length = 36)
    private String actorUserId;
    @Column(nullable = false, length = 100)
    private String action;
    @Column(name = "entity_type", nullable = false, length = 50)
    private String entityType;
    @Column(name = "entity_id", nullable = false, length = 64)
    private String entityId;
    @Column(name = "old_value", columnDefinition = "JSON")
    private String oldValue;
    @Column(name = "new_value", columnDefinition = "JSON")
    private String newValue;
    @Column(name = "ip_address", length = 45)
    private String ipAddress;
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    public static class AuditLogBuilder {
        private Long id;
        private String actorUserId;
        private String action;
        private String entityType;
        private String entityId;
        private String oldValue;
        private String newValue;
        private String ipAddress;
        private LocalDateTime createdAt;
        AuditLogBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public AuditLog.AuditLogBuilder id(final Long id) {
            this.id = id;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AuditLog.AuditLogBuilder actorUserId(final String actorUserId) {
            this.actorUserId = actorUserId;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AuditLog.AuditLogBuilder action(final String action) {
            this.action = action;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AuditLog.AuditLogBuilder entityType(final String entityType) {
            this.entityType = entityType;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AuditLog.AuditLogBuilder entityId(final String entityId) {
            this.entityId = entityId;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AuditLog.AuditLogBuilder oldValue(final String oldValue) {
            this.oldValue = oldValue;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AuditLog.AuditLogBuilder newValue(final String newValue) {
            this.newValue = newValue;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AuditLog.AuditLogBuilder ipAddress(final String ipAddress) {
            this.ipAddress = ipAddress;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AuditLog.AuditLogBuilder createdAt(final LocalDateTime createdAt) {
            this.createdAt = createdAt;
            return this;
        }
        public AuditLog build() {
            return new AuditLog(this.id, this.actorUserId, this.action, this.entityType, this.entityId, this.oldValue, this.newValue, this.ipAddress, this.createdAt);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "AuditLog.AuditLogBuilder(id=" + this.id + ", actorUserId=" + this.actorUserId + ", action=" + this.action + ", entityType=" + this.entityType + ", entityId=" + this.entityId + ", oldValue=" + this.oldValue + ", newValue=" + this.newValue + ", ipAddress=" + this.ipAddress + ", createdAt=" + this.createdAt + ")";
        }
    }
    public static AuditLog.AuditLogBuilder builder() {
        return new AuditLog.AuditLogBuilder();
    }
    public Long getId() {
        return this.id;
    }
    public String getActorUserId() {
        return this.actorUserId;
    }
    public String getAction() {
        return this.action;
    }
    public String getEntityType() {
        return this.entityType;
    }
    public String getEntityId() {
        return this.entityId;
    }
    public String getOldValue() {
        return this.oldValue;
    }
    public String getNewValue() {
        return this.newValue;
    }
    public String getIpAddress() {
        return this.ipAddress;
    }
    public LocalDateTime getCreatedAt() {
        return this.createdAt;
    }
    public void setId(final Long id) {
        this.id = id;
    }
    public void setActorUserId(final String actorUserId) {
        this.actorUserId = actorUserId;
    }
    public void setAction(final String action) {
        this.action = action;
    }
    public void setEntityType(final String entityType) {
        this.entityType = entityType;
    }
    public void setEntityId(final String entityId) {
        this.entityId = entityId;
    }
    public void setOldValue(final String oldValue) {
        this.oldValue = oldValue;
    }
    public void setNewValue(final String newValue) {
        this.newValue = newValue;
    }
    public void setIpAddress(final String ipAddress) {
        this.ipAddress = ipAddress;
    }
    public void setCreatedAt(final LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
    public AuditLog() {
    }
    public AuditLog(final Long id, final String actorUserId, final String action, final String entityType, final String entityId, final String oldValue, final String newValue, final String ipAddress, final LocalDateTime createdAt) {
        this.id = id;
        this.actorUserId = actorUserId;
        this.action = action;
        this.entityType = entityType;
        this.entityId = entityId;
        this.oldValue = oldValue;
        this.newValue = newValue;
        this.ipAddress = ipAddress;
        this.createdAt = createdAt;
    }
}

