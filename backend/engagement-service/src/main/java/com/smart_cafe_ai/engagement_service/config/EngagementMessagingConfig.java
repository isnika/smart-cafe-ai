package com.smart_cafe_ai.engagement_service.config;
import org.springframework.amqp.core.*;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.annotation.EnableScheduling;
import java.util.*;
@Configuration @EnableScheduling
public class EngagementMessagingConfig {
    public static final String EXCHANGE="smart-cafe.engagement", QUEUE="engagement.domain.events.v1", DEAD_EXCHANGE="smart-cafe.engagement.dlx";
    @Bean public Declarables engagementTopology() {
        var exchange=new TopicExchange(EXCHANGE,true,false); var order=new TopicExchange("smart-cafe.order",true,false);
        var payment=new TopicExchange("smart-cafe.payment",true,false); var dead=new DirectExchange(DEAD_EXCHANGE,true,false);
        var queue=QueueBuilder.durable(QUEUE).withArgument("x-single-active-consumer",true).deadLetterExchange(DEAD_EXCHANGE).deadLetterRoutingKey(QUEUE).build();
        var dlq=QueueBuilder.durable(QUEUE+".dlq").build();
        var all=new ArrayList<Declarable>(List.of(exchange,order,payment,dead,queue,dlq,BindingBuilder.bind(dlq).to(dead).with(QUEUE)));
        for(String type:List.of("order.completed","order.cancelled","order.status_changed")) all.add(BindingBuilder.bind(queue).to(order).with(type));
        for(String type:List.of("payment.refunded","payment.failed","invoice.issued")) all.add(BindingBuilder.bind(queue).to(payment).with(type));
        return new Declarables(all);
    }
}
