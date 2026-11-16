package com.smart_cafe_ai.order_service.config;

import org.springframework.amqp.core.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.util.ArrayList;
import java.util.List;

@Configuration
public class IdentityEventsConfig {
    public static final String QUEUE = "order.identity.events.v1";

    @Bean
    public Declarables identityTopology() {
        var exchange = new TopicExchange("smart-cafe.identity", true, false);
        var dlx = new DirectExchange("smart-cafe.order.dlx", true, false);
        var queue = QueueBuilder.durable(QUEUE).withArgument("x-single-active-consumer", true)
                .deadLetterExchange(dlx.getName()).deadLetterRoutingKey(QUEUE).build();
        var dlq = QueueBuilder.durable(QUEUE + ".dlq").build();
        var declarations = new ArrayList<Declarable>(List.of(exchange, dlx, queue, dlq,
                BindingBuilder.bind(dlq).to(dlx).with(QUEUE)));
        for (String type : List.of("identity.user.banned", "identity.user.deactivated",
                "identity.user.activated", "identity.user.status_changed"))
            declarations.add(BindingBuilder.bind(queue).to(exchange).with(type));
        return new Declarables(declarations);
    }
}
