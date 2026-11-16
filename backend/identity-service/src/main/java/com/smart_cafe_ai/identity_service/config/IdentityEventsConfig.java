package com.smart_cafe_ai.identity_service.config;

import com.smart_cafe_ai.identity_service.service.UserStatusEvents;
import org.springframework.amqp.core.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.util.ArrayList;
import java.util.List;

@Configuration
public class IdentityEventsConfig {
    public static final String EXCHANGE = "smart-cafe.identity";
    public static final String ORDER_QUEUE = "order.identity.events.v1";

    @Bean
    public Declarables userStatusTopology() {
        var exchange = new TopicExchange(EXCHANGE, true, false);
        var dlx = new DirectExchange("smart-cafe.order.dlx", true, false);
        var queue = QueueBuilder.durable(ORDER_QUEUE).withArgument("x-single-active-consumer", true)
                .deadLetterExchange(dlx.getName()).deadLetterRoutingKey(ORDER_QUEUE).build();
        var dlq = QueueBuilder.durable(ORDER_QUEUE + ".dlq").build();
        var declarations = new ArrayList<Declarable>(List.of(exchange, dlx, queue, dlq,
                BindingBuilder.bind(dlq).to(dlx).with(ORDER_QUEUE)));
        for (String type : UserStatusEvents.TYPES) declarations.add(BindingBuilder.bind(queue).to(exchange).with(type));
        return new Declarables(declarations);
    }
}
