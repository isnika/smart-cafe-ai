package com.smart_cafe_ai.order_service.service;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.order_service.model.*;
import com.smart_cafe_ai.order_service.repository.OutboxRepository;
import org.springframework.stereotype.Component;
import java.util.*;
@Component
public class OrderEvents {
    public OrderEvents(OutboxRepository outbox, ObjectMapper json) {
        this.outbox=outbox;
        this.json=json;
    }

    private final OutboxRepository outbox;
    private final ObjectMapper json;
    public Map<String,Object> snapshot(CafeOrder order){return json.convertValue(order,new TypeReference<LinkedHashMap<String,Object>>(){});}
    public Map<String,Object> summary(CafeOrder order){var map=snapshot(order);map.remove("items");map.remove("status_history");return map;}
    public void emit(String type,CafeOrder order,String previous,String actor,String note){
        var e=new OutboxEvent();e.eventId=UUID.randomUUID().toString();e.aggregateId=order.id.toString();e.eventType=type;e.correlationId=org.slf4j.MDC.get("trace_id");
        var payload=snapshot(order);payload.remove("id");payload.remove("status_history");
        // Delivery PII stays in the owning service; consumers can fetch an authenticated snapshot when necessary.
        for(String field:List.of("delivery_name","delivery_phone","delivery_address","delivery_latitude","delivery_longitude"))payload.remove(field);
        payload.put("event_id",e.eventId);payload.put("event_type",type);payload.put("event_version",1);payload.put("order_id",order.id);
        payload.put("occurred_at",e.createdAt.toString());payload.put("from_status",previous);payload.put("previous_status",previous);payload.put("changed_by",actor);payload.put("note",note);
        for(var node:(List<?>)payload.get("items")){@SuppressWarnings("unchecked") var item=(Map<String,Object>)node;item.put("order_item_id",item.get("id"));}
        e.payload=payload;outbox.save(e);
    }
}
