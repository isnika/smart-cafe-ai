package com.smart_cafe_ai.inventory_service.entity;

import com.smart_cafe_ai.inventory_service.enums.OutboxStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "Outbox_Events")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OutboxEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "event_id", nullable = false, unique = true, length = 36)
    @Builder.Default
    private String eventId = UUID.randomUUID().toString();

    @Column(name = "aggregate_type", nullable = false, length = 50)
    @Builder.Default
    private String aggregateType = "Inventory";

    @Column(name = "aggregate_id", nullable = false, length = 64)
    @Builder.Default
    private String aggregateId = "0";

    @Column(name = "event_version", nullable = false)
    @Builder.Default
    private Integer eventVersion = 1;

    @Column(name = "correlation_id", length = 64)
    private String correlationId;

    @Column(name = "event_type", nullable = false, length = 100)
    private String eventType;

    @Column(name = "routing_key", nullable = false, length = 100)
    private String routingKey;

    @Column(name = "payload", nullable = false, columnDefinition = "TEXT")
    private String payload;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private OutboxStatus status = OutboxStatus.Pending;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "published_at")
    private LocalDateTime publishedAt;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        if (eventId == null) {
            eventId = UUID.randomUUID().toString();
        }
        if (aggregateType == null) {
            aggregateType = "Inventory";
        }
        if (aggregateId == null) {
            aggregateId = "0";
        }
        if (eventVersion == null) {
            eventVersion = 1;
        }
    }
}
