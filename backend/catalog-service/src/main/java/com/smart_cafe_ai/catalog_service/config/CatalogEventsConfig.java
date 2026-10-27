package com.smart_cafe_ai.catalog_service.config;

import org.springframework.amqp.core.TopicExchange;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "app.catalog-events.publisher-enabled", havingValue = "true", matchIfMissing = true)
public class CatalogEventsConfig {
    public static final String EXCHANGE = "smart-cafe.catalog";

    // Each consumer service owns its durable queue and binding; unrouted messages stay in the outbox.
    @Bean
    public TopicExchange catalogExchange() { return new TopicExchange(EXCHANGE, true, false); }
}
