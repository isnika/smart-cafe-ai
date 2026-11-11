package com.smart_cafe_ai.order_service.config;
import org.springframework.amqp.core.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration @EnableScheduling
public class OrderMessagingConfig {
    public static final String EXCHANGE="smart-cafe.order";
    @Bean public TopicExchange orderExchange(){return new TopicExchange(EXCHANGE,true,false);}
    @Configuration @ConditionalOnProperty(name="app.order-events.consumer-enabled",havingValue="true")
    public static class Consumers {
        public static final String PAYMENT_QUEUE="order.payment.events.v1",STORE_QUEUE="order.store.events.v1";
        @Bean public Declarables inboundTopology(){
            var payment=new TopicExchange("smart-cafe.payment",true,false);var store=new TopicExchange("smart-cafe.store",true,false);
            var dlx=new DirectExchange("smart-cafe.order.dlx",true,false);
            var pq=QueueBuilder.durable(PAYMENT_QUEUE).deadLetterExchange(dlx.getName()).deadLetterRoutingKey(PAYMENT_QUEUE).build();
            var sq=QueueBuilder.durable(STORE_QUEUE).deadLetterExchange(dlx.getName()).deadLetterRoutingKey(STORE_QUEUE).build();
            var pdq=QueueBuilder.durable(PAYMENT_QUEUE+".dlq").build();var sdq=QueueBuilder.durable(STORE_QUEUE+".dlq").build();
            var declarations=new java.util.ArrayList<Declarable>(java.util.List.of(payment,store,dlx,pq,sq,pdq,sdq,
                    BindingBuilder.bind(pdq).to(dlx).with(PAYMENT_QUEUE),BindingBuilder.bind(sdq).to(dlx).with(STORE_QUEUE)));
            for(String type:java.util.List.of("payment.succeeded","payment.refunded","payment.failed","payment.expired"))declarations.add(BindingBuilder.bind(pq).to(payment).with(type));
            for(String type:java.util.List.of("store.table_session.closed","store.branch.status_changed"))declarations.add(BindingBuilder.bind(sq).to(store).with(type));
            return new Declarables(declarations);
        }
    }
}
