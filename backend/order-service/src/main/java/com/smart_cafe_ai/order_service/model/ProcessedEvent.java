package com.smart_cafe_ai.order_service.model;
import jakarta.persistence.*;
import java.time.*;
@Entity @Table(name="Processed_Events")
public class ProcessedEvent {
    @Id @Column(name="event_id",length=36) public String eventId;
    @Column(name="event_type",nullable=false,length=100) public String eventType;
    @Column(name="source_service",length=100) public String sourceService;
    @Column(name="processed_at",nullable=false) public LocalDateTime processedAt=LocalDateTime.now(ZoneOffset.UTC);
}
