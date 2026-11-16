package com.smart_cafe_ai.engagement_service.consumer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.engagement_service.config.EngagementMessagingConfig;
import com.smart_cafe_ai.engagement_service.service.EngagementEventService;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
@Component
public class EngagementEventConsumer {
    private final ObjectMapper json;
    private final EngagementEventService service;
    public EngagementEventConsumer(ObjectMapper json,EngagementEventService service) { this.json=json; this.service=service; }
    @RabbitListener(queues=EngagementMessagingConfig.QUEUE,autoStartup="${app.engagement.consumer-enabled:true}")
    public void consume(Message message) {
        com.fasterxml.jackson.databind.JsonNode event;
        try { event=json.readTree(message.getBody()); }
        catch(Exception ex) { throw new AmqpRejectAndDontRequeueException("Invalid engagement event JSON"); }
        service.consume(event,message.getMessageProperties().getType());
    }
}
