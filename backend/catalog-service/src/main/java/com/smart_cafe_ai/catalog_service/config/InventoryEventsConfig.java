package com.smart_cafe_ai.catalog_service.config;
import org.springframework.amqp.core.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import com.smart_cafe_ai.catalog_service.service.InventoryAvailabilityService;
@Configuration @ConditionalOnProperty(name="app.catalog-events.inventory-consumer-enabled",havingValue="true")
public class InventoryEventsConfig {
    public static final String EXCHANGE="smart-cafe.inventory";
    public static final String QUEUE="catalog.inventory.availability";
    @Bean public Declarables inventoryTopology() {
        var exchange=new TopicExchange(EXCHANGE,true,false);
        var deadExchange=new DirectExchange("smart-cafe.catalog.dlx",true,false);
        var queue=QueueBuilder.durable(QUEUE).singleActiveConsumer().deadLetterExchange(deadExchange.getName()).deadLetterRoutingKey(QUEUE).build();
        var dead=QueueBuilder.durable(QUEUE+".dlq").build();
        return new Declarables(exchange,deadExchange,queue,dead,
                BindingBuilder.bind(queue).to(exchange).with(InventoryAvailabilityService.LOW_STOCK),
                BindingBuilder.bind(queue).to(exchange).with(InventoryAvailabilityService.RESTOCKED),
                BindingBuilder.bind(dead).to(deadExchange).with(QUEUE));
    }
}
