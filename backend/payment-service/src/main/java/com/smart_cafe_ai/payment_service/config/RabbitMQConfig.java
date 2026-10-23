package com.smart_cafe_ai.payment_service.config;

import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMQConfig {

    @Value("${rabbitmq.exchange.payment:smartcafe.payment.exchange}")
    private String paymentExchange;

    @Value("${rabbitmq.routing-key.payment-succeeded:payment.succeeded}")
    private String paymentSucceededRoutingKey;

    @Value("${rabbitmq.routing-key.payment-failed:payment.failed}")
    private String paymentFailedRoutingKey;

    @Value("${rabbitmq.routing-key.refund-processed:refund.processed}")
    private String refundProcessedRoutingKey;

    @Bean
    public TopicExchange paymentTopicExchange() {
        return new TopicExchange(paymentExchange, true, false);
    }

    @Bean
    public Queue paymentSucceededQueue() {
        return QueueBuilder.durable("smartcafe.payment.succeeded.queue").build();
    }

    @Bean
    public Queue paymentFailedQueue() {
        return QueueBuilder.durable("smartcafe.payment.failed.queue").build();
    }

    @Bean
    public Queue refundProcessedQueue() {
        return QueueBuilder.durable("smartcafe.refund.processed.queue").build();
    }

    @Bean
    public Binding paymentSucceededBinding(Queue paymentSucceededQueue, TopicExchange paymentTopicExchange) {
        return BindingBuilder.bind(paymentSucceededQueue).to(paymentTopicExchange).with(paymentSucceededRoutingKey);
    }

    @Bean
    public Binding paymentFailedBinding(Queue paymentFailedQueue, TopicExchange paymentTopicExchange) {
        return BindingBuilder.bind(paymentFailedQueue).to(paymentTopicExchange).with(paymentFailedRoutingKey);
    }

    @Bean
    public Binding refundProcessedBinding(Queue refundProcessedQueue, TopicExchange paymentTopicExchange) {
        return BindingBuilder.bind(refundProcessedQueue).to(paymentTopicExchange).with(refundProcessedRoutingKey);
    }

    @Bean
    public MessageConverter jsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean
    public AmqpTemplate amqpTemplate(ConnectionFactory connectionFactory) {
        RabbitTemplate rabbitTemplate = new RabbitTemplate(connectionFactory);
        rabbitTemplate.setMessageConverter(jsonMessageConverter());
        return rabbitTemplate;
    }
}
