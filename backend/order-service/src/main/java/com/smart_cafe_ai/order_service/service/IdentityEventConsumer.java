package com.smart_cafe_ai.order_service.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.order_service.config.IdentityEventsConfig;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import java.io.IOException;

@Component
public class IdentityEventConsumer {
    private final IdentityEventService service;
    private final ObjectMapper json;

    public IdentityEventConsumer(IdentityEventService service, ObjectMapper json) {
        this.service = service;
        this.json = json;
    }

    @RabbitListener(queues = IdentityEventsConfig.QUEUE, autoStartup = "${app.identity-events.consumer-enabled:true}")
    public void receive(Message message) {
        try {
            var event = json.readTree(message.getBody());
            String routingKey = message.getMessageProperties().getReceivedRoutingKey();
            String type = message.getMessageProperties().getType();
            if (type != null && !type.equals(routingKey)) throw new IllegalArgumentException("Message type mismatch");
            service.accept(routingKey, event);
        } catch (IOException | IllegalArgumentException ex) {
            throw new AmqpRejectAndDontRequeueException("Invalid Identity user status event", ex);
        }
    }
}
