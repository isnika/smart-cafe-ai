package com.smart_cafe_ai.order_service.service;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import java.io.IOException;
@Component @ConditionalOnProperty(name="app.order-events.consumer-enabled",havingValue="true")
public class OrderEventConsumer {
    public OrderEventConsumer(PaymentEventService service, ObjectMapper json) {
        this.service=service;
        this.json=json;
    }

    private final PaymentEventService service;
    private final ObjectMapper json;
    @RabbitListener(queues={"order.payment.events.v1","order.store.events.v1"})
    public void receive(Message message) throws IOException {
        service.accept(message.getMessageProperties().getReceivedRoutingKey(),json.readTree(message.getBody()));
    }
}
