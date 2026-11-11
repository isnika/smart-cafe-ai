package com.smart_cafe_ai.identity_service.config;

import org.springframework.amqp.core.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
public class RabbitMQConfig {
    public static final String EXCHANGE = "smart-cafe.notifications";
    public static final String ROUTING_KEY = "otp.email";
    public static final String QUEUE = "engagement.otp.email";
    public static final String DEAD_EXCHANGE = "smart-cafe.notifications.dlx";
    public static final String DEAD_QUEUE = "engagement.otp.email.dlq";

    @Bean
    public Declarables otpEmailTopology() {
        DirectExchange exchange = new DirectExchange(EXCHANGE);
        DirectExchange deadExchange = new DirectExchange(DEAD_EXCHANGE);
        Queue queue = QueueBuilder.durable(QUEUE)
                .withArgument("x-single-active-consumer", true)
                .deadLetterExchange(DEAD_EXCHANGE).deadLetterRoutingKey(ROUTING_KEY).build();
        // OTP payloads must not remain in the dead-letter queue indefinitely.
        Queue deadQueue = QueueBuilder.durable(DEAD_QUEUE).ttl(300_000).build();
        return new Declarables(exchange, deadExchange, queue, deadQueue,
                BindingBuilder.bind(queue).to(exchange).with(ROUTING_KEY),
                BindingBuilder.bind(deadQueue).to(deadExchange).with(ROUTING_KEY));
    }
}
