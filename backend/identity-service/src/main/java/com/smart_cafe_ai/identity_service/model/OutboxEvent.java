package com.smart_cafe_ai.identity_service.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "Outbox_Events")
public class OutboxEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "event_id", nullable = false, unique = true, length = 36)
    private String eventId;
    @Column(name = "aggregate_type", nullable = false, length = 50)
    private String aggregateType;
    @Column(name = "aggregate_id", nullable = false, length = 64)
    private String aggregateId;
    @Column(name = "event_type", nullable = false, length = 100)
    private String eventType;
    @Column(name = "event_version", nullable = false)
    private Integer eventVersion;
    @Column(name = "correlation_id", length = 64)
    private String correlationId;
    @Column(columnDefinition = "JSON", nullable = false)
    private String payload;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OutboxStatus status;
    @Column(name = "retry_count", nullable = false)
    private Integer retryCount;
    @Column(name = "next_retry_at")
    private LocalDateTime nextRetryAt;
    @Column(name = "last_error", length = 500)
    private String lastError;
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    @Column(name = "published_at")
    private LocalDateTime publishedAt;


    public enum OutboxStatus {
        Pending, Published, Failed;
    }
    private static Integer $default$eventVersion() {
        return 1;
    }
    private static OutboxStatus $default$status() {
        return OutboxStatus.Pending;
    }
    private static Integer $default$retryCount() {
        return 0;
    }
    public static class OutboxEventBuilder {
        private Long id;
        private String eventId;
        private String aggregateType;
        private String aggregateId;
        private String eventType;
        private boolean eventVersion$set;
        private Integer eventVersion$value;
        private String correlationId;
        private String payload;
        private boolean status$set;
        private OutboxStatus status$value;
        private boolean retryCount$set;
        private Integer retryCount$value;
        private LocalDateTime nextRetryAt;
        private String lastError;
        private LocalDateTime createdAt;
        private LocalDateTime publishedAt;
        OutboxEventBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public OutboxEvent.OutboxEventBuilder id(final Long id) {
            this.id = id;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OutboxEvent.OutboxEventBuilder eventId(final String eventId) {
            this.eventId = eventId;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OutboxEvent.OutboxEventBuilder aggregateType(final String aggregateType) {
            this.aggregateType = aggregateType;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OutboxEvent.OutboxEventBuilder aggregateId(final String aggregateId) {
            this.aggregateId = aggregateId;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OutboxEvent.OutboxEventBuilder eventType(final String eventType) {
            this.eventType = eventType;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OutboxEvent.OutboxEventBuilder eventVersion(final Integer eventVersion) {
            this.eventVersion$value = eventVersion;
            eventVersion$set = true;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OutboxEvent.OutboxEventBuilder correlationId(final String correlationId) {
            this.correlationId = correlationId;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OutboxEvent.OutboxEventBuilder payload(final String payload) {
            this.payload = payload;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OutboxEvent.OutboxEventBuilder status(final OutboxStatus status) {
            this.status$value = status;
            status$set = true;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OutboxEvent.OutboxEventBuilder retryCount(final Integer retryCount) {
            this.retryCount$value = retryCount;
            retryCount$set = true;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OutboxEvent.OutboxEventBuilder nextRetryAt(final LocalDateTime nextRetryAt) {
            this.nextRetryAt = nextRetryAt;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OutboxEvent.OutboxEventBuilder lastError(final String lastError) {
            this.lastError = lastError;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OutboxEvent.OutboxEventBuilder createdAt(final LocalDateTime createdAt) {
            this.createdAt = createdAt;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public OutboxEvent.OutboxEventBuilder publishedAt(final LocalDateTime publishedAt) {
            this.publishedAt = publishedAt;
            return this;
        }
        public OutboxEvent build() {
            Integer eventVersion$value = this.eventVersion$value;
            if (!this.eventVersion$set) eventVersion$value = OutboxEvent.$default$eventVersion();
            OutboxStatus status$value = this.status$value;
            if (!this.status$set) status$value = OutboxEvent.$default$status();
            Integer retryCount$value = this.retryCount$value;
            if (!this.retryCount$set) retryCount$value = OutboxEvent.$default$retryCount();
            return new OutboxEvent(this.id, this.eventId, this.aggregateType, this.aggregateId, this.eventType, eventVersion$value, this.correlationId, this.payload, status$value, retryCount$value, this.nextRetryAt, this.lastError, this.createdAt, this.publishedAt);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "OutboxEvent.OutboxEventBuilder(id=" + this.id + ", eventId=" + this.eventId + ", aggregateType=" + this.aggregateType + ", aggregateId=" + this.aggregateId + ", eventType=" + this.eventType + ", eventVersion$value=" + this.eventVersion$value + ", correlationId=" + this.correlationId + ", payload=" + this.payload + ", status$value=" + this.status$value + ", retryCount$value=" + this.retryCount$value + ", nextRetryAt=" + this.nextRetryAt + ", lastError=" + this.lastError + ", createdAt=" + this.createdAt + ", publishedAt=" + this.publishedAt + ")";
        }
    }
    public static OutboxEvent.OutboxEventBuilder builder() {
        return new OutboxEvent.OutboxEventBuilder();
    }
    public Long getId() {
        return this.id;
    }
    public String getEventId() {
        return this.eventId;
    }
    public String getAggregateType() {
        return this.aggregateType;
    }
    public String getAggregateId() {
        return this.aggregateId;
    }
    public String getEventType() {
        return this.eventType;
    }
    public Integer getEventVersion() {
        return this.eventVersion;
    }
    public String getCorrelationId() {
        return this.correlationId;
    }
    public String getPayload() {
        return this.payload;
    }
    public OutboxStatus getStatus() {
        return this.status;
    }
    public Integer getRetryCount() {
        return this.retryCount;
    }
    public LocalDateTime getNextRetryAt() {
        return this.nextRetryAt;
    }
    public String getLastError() {
        return this.lastError;
    }
    public LocalDateTime getCreatedAt() {
        return this.createdAt;
    }
    public LocalDateTime getPublishedAt() {
        return this.publishedAt;
    }
    public void setId(final Long id) {
        this.id = id;
    }
    public void setEventId(final String eventId) {
        this.eventId = eventId;
    }
    public void setAggregateType(final String aggregateType) {
        this.aggregateType = aggregateType;
    }
    public void setAggregateId(final String aggregateId) {
        this.aggregateId = aggregateId;
    }
    public void setEventType(final String eventType) {
        this.eventType = eventType;
    }
    public void setEventVersion(final Integer eventVersion) {
        this.eventVersion = eventVersion;
    }
    public void setCorrelationId(final String correlationId) {
        this.correlationId = correlationId;
    }
    public void setPayload(final String payload) {
        this.payload = payload;
    }
    public void setStatus(final OutboxStatus status) {
        this.status = status;
    }
    public void setRetryCount(final Integer retryCount) {
        this.retryCount = retryCount;
    }
    public void setNextRetryAt(final LocalDateTime nextRetryAt) {
        this.nextRetryAt = nextRetryAt;
    }
    public void setLastError(final String lastError) {
        this.lastError = lastError;
    }
    public void setCreatedAt(final LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
    public void setPublishedAt(final LocalDateTime publishedAt) {
        this.publishedAt = publishedAt;
    }
    public OutboxEvent() {
        this.eventVersion = OutboxEvent.$default$eventVersion();
        this.status = OutboxEvent.$default$status();
        this.retryCount = OutboxEvent.$default$retryCount();
    }
    public OutboxEvent(final Long id, final String eventId, final String aggregateType, final String aggregateId, final String eventType, final Integer eventVersion, final String correlationId, final String payload, final OutboxStatus status, final Integer retryCount, final LocalDateTime nextRetryAt, final String lastError, final LocalDateTime createdAt, final LocalDateTime publishedAt) {
        this.id = id;
        this.eventId = eventId;
        this.aggregateType = aggregateType;
        this.aggregateId = aggregateId;
        this.eventType = eventType;
        this.eventVersion = eventVersion;
        this.correlationId = correlationId;
        this.payload = payload;
        this.status = status;
        this.retryCount = retryCount;
        this.nextRetryAt = nextRetryAt;
        this.lastError = lastError;
        this.createdAt = createdAt;
        this.publishedAt = publishedAt;
    }
}

