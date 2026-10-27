package com.smart_cafe_ai.catalog_service.model;

import com.smart_cafe_ai.catalog_service.security.CatalogActor;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.*;
import java.util.Map;

@Entity
@Table(name = "Audit_Logs")
@Getter
@NoArgsConstructor
public class AuditLog {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "actor_user_id", length = 36)
    private String actorUserId;
    @Column(nullable = false, length = 100)
    private String action;
    @Column(name = "entity_type", nullable = false, length = 50)
    private String entityType;
    @Column(name = "entity_id", nullable = false, length = 64)
    private String entityId;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "old_value", columnDefinition = "JSON")
    private Map<String, Object> oldValue;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "new_value", columnDefinition = "JSON")
    private Map<String, Object> newValue;
    @Column(name = "ip_address", length = 45)
    private String ipAddress;
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public AuditLog(CatalogActor actor, String action, Integer categoryId,
                    Map<String, Object> oldValue, Map<String, Object> newValue) {
        this(actor, action, "Category", categoryId, oldValue, newValue);
    }

    public AuditLog(CatalogActor actor, String action, String entityType, Integer entityId,
                    Map<String, Object> oldValue, Map<String, Object> newValue) {
        this.actorUserId = actor.userId();
        this.ipAddress = actor.ipAddress();
        this.action = action;
        this.entityType = entityType;
        this.entityId = entityId.toString();
        this.oldValue = oldValue;
        this.newValue = newValue;
        this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
    }
}

