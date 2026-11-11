package com.smart_cafe_ai.order_service.model;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.*;
import java.util.*;
@Entity @Table(name="Outbox_Events")
public class OutboxEvent {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @Column(name="event_id",unique=true,nullable=false,length=36) public String eventId;
    @Column(name="aggregate_type",nullable=false,length=50) public String aggregateType="Order";
    @Column(name="aggregate_id",nullable=false,length=64) public String aggregateId;
    @Column(name="event_type",nullable=false,length=100) public String eventType;
    @Column(name="event_version",nullable=false) public short eventVersion=1;
    @Column(name="correlation_id",length=64) public String correlationId;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false,columnDefinition="json") public Map<String,Object> payload;
    @Column(nullable=false,length=10) public String status="Pending";
    @Column(name="retry_count",nullable=false) public int retryCount;
    @Column(name="next_retry_at") public LocalDateTime nextRetryAt;
    @Column(name="last_error",length=500) public String lastError;
    @Column(name="created_at",nullable=false) public LocalDateTime createdAt=LocalDateTime.now(ZoneOffset.UTC);
    @Column(name="published_at") public LocalDateTime publishedAt;
}
