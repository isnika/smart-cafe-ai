package com.smart_cafe_ai.catalog_service.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.*;
import java.util.*;

@Entity
@Table(name = "Outbox_Events")
@Getter
@NoArgsConstructor
public class OutboxEvent {
    public static final String PRODUCT_STATUS_CHANGED = "catalog.product.status_changed";
    public static final String VARIANT_PRICE_CHANGED = "catalog.variant.price_changed";
    public enum Status { Pending, Published, Failed }
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "event_id", nullable = false, unique = true, length = 36)
    private String eventId;
    @Column(name = "aggregate_type", nullable = false, length = 50)
    private String aggregateType;
    @Column(name = "aggregate_id", nullable = false, length = 64)
    private String aggregateId;
    @Column(name = "event_type", nullable = false, length = 100)
    private String eventType;
    @Column(name = "event_version", nullable = false, columnDefinition = "SMALLINT UNSIGNED")
    private int eventVersion;
    @Column(name = "correlation_id", length = 64)
    private String correlationId;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "JSON", nullable = false)
    private Map<String, Object> payload;
    @Enumerated(EnumType.STRING) @Column(nullable = false)
    private Status status;
    @Column(name = "retry_count", nullable = false, columnDefinition = "INT UNSIGNED")
    private int retryCount;
    @Column(name = "next_retry_at")
    private LocalDateTime nextRetryAt;
    @Column(name = "last_error", length = 500)
    private String lastError;
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    @Column(name = "published_at")
    private LocalDateTime publishedAt;

    public static OutboxEvent productStatusChanged(Product product) {
        var event = new OutboxEvent();
        event.eventId = UUID.randomUUID().toString();
        event.aggregateType = "Product";
        event.aggregateId = product.getId().toString();
        event.eventType = PRODUCT_STATUS_CHANGED;
        event.eventVersion = 1;
        event.status = Status.Pending;
        event.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        event.correlationId=org.slf4j.MDC.get("trace_id");
        event.payload = Map.of("event_id", event.eventId, "event_type", event.eventType, "event_version", 1,
                "product_id", product.getId(), "status", product.getStatus().name(),
                "changed_at", product.getUpdatedAt().toInstant(ZoneOffset.UTC).toString());
        return event;
    }
    public static OutboxEvent variantPriceChanged(ProductVariant variant, java.math.BigDecimal oldPrice) {
        var event=new OutboxEvent(); event.eventId=UUID.randomUUID().toString(); event.aggregateType="Variant";
        event.aggregateId=variant.getId().toString(); event.eventType=VARIANT_PRICE_CHANGED;
        event.eventVersion=1; event.status=Status.Pending; event.createdAt=LocalDateTime.now(ZoneOffset.UTC).withNano(0);
        event.correlationId=org.slf4j.MDC.get("trace_id");
        event.payload=Map.of("event_id",event.eventId,"event_type",event.eventType,"event_version",1,
                "variant_id",variant.getId(),"old_price",oldPrice,"new_price",variant.getPrice(),
                "changed_at",event.createdAt.toInstant(ZoneOffset.UTC).toString());
        return event;
    }

    public void published() {
        status = Status.Published;
        publishedAt = LocalDateTime.now(ZoneOffset.UTC);
        nextRetryAt = null;
        lastError = null;
    }

    public void retry(Exception failure) {
        retryCount++;
        nextRetryAt = LocalDateTime.now(ZoneOffset.UTC).plusSeconds(Math.min(300, 5L * retryCount));
        // Do not leak connection credentials or broker internals into persisted error messages.
        lastError = failure.getClass().getSimpleName();
    }
}
