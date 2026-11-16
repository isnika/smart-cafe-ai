package com.smart_cafe_ai.engagement_service.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity @Table(name = "Processed_Events")
public class ProcessedEvent implements org.springframework.data.domain.Persistable<String> {
    @Id @Column(name = "event_id", length = 36) public String eventId;
    @Column(name = "event_type", nullable = false, length = 100) public String eventType;
    @Column(name = "source_service", length = 100) public String sourceService;
    @Column(name = "processed_at", nullable = false) public Instant processedAt = Instant.now();
    @Override public String getId() { return eventId; }
    // Consumer markers must INSERT, never merge an existing concurrent delivery.
    @Override @Transient public boolean isNew() { return true; }
}
