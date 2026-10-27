package com.smart_cafe_ai.catalog_service.model;
import jakarta.persistence.*;
import lombok.*;
import java.time.*;
@Entity @Table(name="Processed_Events") @Getter @NoArgsConstructor
public class ProcessedEvent {
    @Id @Column(name="event_id",length=36) private String eventId;
    @Column(name="event_type",nullable=false,length=100) private String eventType;
    @Column(name="source_service",length=100) private String sourceService;
    @Column(name="processed_at",nullable=false) private LocalDateTime processedAt;
    public ProcessedEvent(String id,String type) {eventId=id;eventType=type;sourceService="inventory-service";processedAt=LocalDateTime.now(ZoneOffset.UTC).withNano(0);}
}
