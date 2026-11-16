package com.smart_cafe_ai.engagement_service.service;

import com.smart_cafe_ai.engagement_service.model.OutboxEvent;
import com.smart_cafe_ai.engagement_service.repository.OutboxEventRepository;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import java.util.*;

@Service
public class EngagementEvents {
    private final OutboxEventRepository repository;
    public EngagementEvents(OutboxEventRepository repository) { this.repository=repository; }
    public void emit(String type,String aggregateType,Object aggregateId,Map<String,Object> values) {
        var e=new OutboxEvent();
        e.eventId=UUID.randomUUID().toString(); e.eventType=type; e.aggregateType=aggregateType;
        e.aggregateId=aggregateId.toString(); e.correlationId=MDC.get("trace_id");
        e.payload=new LinkedHashMap<>(values);
        e.payload.put("event_id",e.eventId); e.payload.put("event_type",type); e.payload.put("event_version",1);
        e.payload.put("occurred_at",e.createdAt.toString());
        repository.save(e);
    }
}
