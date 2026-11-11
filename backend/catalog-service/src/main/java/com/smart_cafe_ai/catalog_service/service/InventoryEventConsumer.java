package com.smart_cafe_ai.catalog_service.service;
import com.fasterxml.jackson.databind.*;
import com.smart_cafe_ai.catalog_service.config.InventoryEventsConfig;
import com.smart_cafe_ai.catalog_service.repository.ProcessedEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import java.util.*;
@Component @RequiredArgsConstructor
@ConditionalOnProperty(name="app.catalog-events.inventory-consumer-enabled",havingValue="true")
public class InventoryEventConsumer {
    private final InventoryAvailabilityService service;
    private final ProcessedEventRepository processed;
    private final ObjectMapper json;
    @RabbitListener(queues=InventoryEventsConfig.QUEUE)
    public void consume(Message message) {
        InventoryAvailabilityService.Event event;
        try {
            JsonNode body=json.readTree(message.getBody());
            String type=message.getMessageProperties().getReceivedRoutingKey();
            if(body.has("event_type") && !Objects.equals(body.path("event_type").asText(),type)) throw new IllegalArgumentException("Event type mismatch");
            String id=body.path("event_id").asText();
            if(id.length()!=36) throw new IllegalArgumentException("Invalid event id"); UUID.fromString(id);
            JsonNode branch=body.path("branch_id");
            if(!branch.isIntegralNumber() || !branch.canConvertToInt() || branch.intValue()<=0) throw new IllegalArgumentException("Invalid branch id");
            if(!InventoryAvailabilityService.LOW_STOCK.equals(type) && !InventoryAvailabilityService.RESTOCKED.equals(type)) throw new IllegalArgumentException("Unsupported event type");
            // Excel currently specifies affected_variant_ids only. Option targets need a separate agreed contract.
            event=new InventoryAvailabilityService.Event(id,type,branch.intValue(),ids(body,"affected_variant_ids"));
        } catch(Exception ex) {throw new AmqpRejectAndDontRequeueException("Inventory payload không hợp lệ.",ex);}
        try {service.process(event);}
        catch(DataIntegrityViolationException ex) {
            // This catch runs outside the failed transaction. Do not swallow unrelated DB errors.
            if(!processed.existsById(event.id())) throw ex;
        }
    }
    private List<Integer> ids(JsonNode body,String field) {
        if(!body.has(field)) return List.of(); JsonNode values=body.get(field);
        if(!values.isArray() || values.size()>1000) throw new IllegalArgumentException("Invalid affected ids");
        Set<Integer> result=new LinkedHashSet<>();
        for(var value:values) {
            if(!value.isIntegralNumber() || !value.canConvertToInt() || value.intValue()<=0) throw new IllegalArgumentException("Invalid affected id");
            result.add(value.intValue());
        }
        return List.copyOf(result);
    }
}
