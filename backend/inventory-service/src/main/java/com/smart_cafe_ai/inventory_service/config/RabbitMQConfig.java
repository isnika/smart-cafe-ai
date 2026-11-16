package com.smart_cafe_ai.inventory_service.config;

import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMQConfig {

    // --- Exchange names ---
    public static final String ORDER_EVENTS_EXCHANGE = "order.events";
    public static final String INVENTORY_EVENTS_EXCHANGE = "inventory.events";

    // --- Queue names ---
    public static final String INVENTORY_ORDER_CONFIRMED_QUEUE = "inventory.order.confirmed";
    public static final String INVENTORY_ORDER_CANCELLED_QUEUE = "inventory.order.cancelled";
    public static final String INVENTORY_ORDER_REJECTED_QUEUE = "inventory.order.rejected";

    // --- Routing keys ---
    public static final String ORDER_CONFIRMED_ROUTING_KEY = "order.confirmed";
    public static final String ORDER_CANCELLED_ROUTING_KEY = "order.cancelled";
    public static final String ORDER_REJECTED_ROUTING_KEY = "order.rejected";

    // --- Outbox routing keys ---
    public static final String VARIANT_AVAILABILITY_CHANGED_ROUTING_KEY = "inventory.variant.availability.changed";
    public static final String PURCHASE_ORDER_COMPLETED_ROUTING_KEY = "inventory.purchase_order.completed";

    // ============================
    // Exchanges
    // ============================

    @Bean
    public TopicExchange orderEventsExchange() {
        return ExchangeBuilder.topicExchange(ORDER_EVENTS_EXCHANGE)
                .durable(true)
                .build();
    }

    @Bean
    public TopicExchange inventoryEventsExchange() {
        return ExchangeBuilder.topicExchange(INVENTORY_EVENTS_EXCHANGE)
                .durable(true)
                .build();
    }

    // ============================
    // Queues
    // ============================

    @Bean
    public Queue inventoryOrderConfirmedQueue() {
        return QueueBuilder.durable(INVENTORY_ORDER_CONFIRMED_QUEUE).build();
    }

    @Bean
    public Queue inventoryOrderCancelledQueue() {
        return QueueBuilder.durable(INVENTORY_ORDER_CANCELLED_QUEUE).build();
    }

    @Bean
    public Queue inventoryOrderRejectedQueue() {
        return QueueBuilder.durable(INVENTORY_ORDER_REJECTED_QUEUE).build();
    }

    // ============================
    // Bindings
    // ============================

    @Bean
    public Binding bindingOrderConfirmed(Queue inventoryOrderConfirmedQueue, TopicExchange orderEventsExchange) {
        return BindingBuilder.bind(inventoryOrderConfirmedQueue)
                .to(orderEventsExchange)
                .with(ORDER_CONFIRMED_ROUTING_KEY);
    }

    @Bean
    public Binding bindingOrderCancelled(Queue inventoryOrderCancelledQueue, TopicExchange orderEventsExchange) {
        return BindingBuilder.bind(inventoryOrderCancelledQueue)
                .to(orderEventsExchange)
                .with(ORDER_CANCELLED_ROUTING_KEY);
    }

    @Bean
    public Binding bindingOrderRejected(Queue inventoryOrderRejectedQueue, TopicExchange orderEventsExchange) {
        return BindingBuilder.bind(inventoryOrderRejectedQueue)
                .to(orderEventsExchange)
                .with(ORDER_REJECTED_ROUTING_KEY);
    }

    // ============================
    // Message Converter
    // ============================

    @Bean
    public MessageConverter jsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(jsonMessageConverter());
        return template;
    }

    @Bean
    public SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(
            ConnectionFactory connectionFactory) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setMessageConverter(jsonMessageConverter());
        factory.setAcknowledgeMode(org.springframework.amqp.core.AcknowledgeMode.MANUAL);
        return factory;
    }
}
