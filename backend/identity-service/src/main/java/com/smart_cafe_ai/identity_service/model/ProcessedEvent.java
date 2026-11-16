package com.smart_cafe_ai.identity_service.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "Processed_Events")
public class ProcessedEvent {
    @Id
    @Column(name = "event_id", length = 36)
    private String eventId;
    @Column(name = "event_type", nullable = false, length = 100)
    private String eventType;
    @Column(name = "source_service", length = 100)
    private String sourceService;
    @CreationTimestamp
    @Column(name = "processed_at", nullable = false, updatable = false)
    private LocalDateTime processedAt;
    public static class ProcessedEventBuilder {
        private String eventId;
        private String eventType;
        private String sourceService;
        private LocalDateTime processedAt;
        ProcessedEventBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public ProcessedEvent.ProcessedEventBuilder eventId(final String eventId) {
            this.eventId = eventId;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public ProcessedEvent.ProcessedEventBuilder eventType(final String eventType) {
            this.eventType = eventType;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public ProcessedEvent.ProcessedEventBuilder sourceService(final String sourceService) {
            this.sourceService = sourceService;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public ProcessedEvent.ProcessedEventBuilder processedAt(final LocalDateTime processedAt) {
            this.processedAt = processedAt;
            return this;
        }
        public ProcessedEvent build() {
            return new ProcessedEvent(this.eventId, this.eventType, this.sourceService, this.processedAt);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "ProcessedEvent.ProcessedEventBuilder(eventId=" + this.eventId + ", eventType=" + this.eventType + ", sourceService=" + this.sourceService + ", processedAt=" + this.processedAt + ")";
        }
    }
    public static ProcessedEvent.ProcessedEventBuilder builder() {
        return new ProcessedEvent.ProcessedEventBuilder();
    }
    public String getEventId() {
        return this.eventId;
    }
    public String getEventType() {
        return this.eventType;
    }
    public String getSourceService() {
        return this.sourceService;
    }
    public LocalDateTime getProcessedAt() {
        return this.processedAt;
    }
    public void setEventId(final String eventId) {
        this.eventId = eventId;
    }
    public void setEventType(final String eventType) {
        this.eventType = eventType;
    }
    public void setSourceService(final String sourceService) {
        this.sourceService = sourceService;
    }
    public void setProcessedAt(final LocalDateTime processedAt) {
        this.processedAt = processedAt;
    }
    public ProcessedEvent() {
    }
    public ProcessedEvent(final String eventId, final String eventType, final String sourceService, final LocalDateTime processedAt) {
        this.eventId = eventId;
        this.eventType = eventType;
        this.sourceService = sourceService;
        this.processedAt = processedAt;
    }
}

