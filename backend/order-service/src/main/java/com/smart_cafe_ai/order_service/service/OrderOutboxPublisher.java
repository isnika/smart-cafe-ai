package com.smart_cafe_ai.order_service.service;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.order_service.config.OrderMessagingConfig;
import com.smart_cafe_ai.order_service.repository.OutboxRepository;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.concurrent.TimeUnit;

@Component
@ConditionalOnProperty(name="app.order-events.publisher-enabled",havingValue="true",matchIfMissing=true)
public class OrderOutboxPublisher {
    private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(OrderOutboxPublisher.class);
    public OrderOutboxPublisher(OutboxRepository outbox, RabbitTemplate rabbit, ObjectMapper json) {
        this.outbox=outbox;
        this.rabbit=rabbit;
        this.json=json;
    }

    private final OutboxRepository outbox;
    private final RabbitTemplate rabbit;
    private final ObjectMapper json;
    @Scheduled(fixedDelayString="${app.order-events.publish-delay-ms:1000}") @Transactional
    public void publish(){
        for(var event:outbox.ready(LocalDateTime.now(ZoneOffset.UTC),PageRequest.of(0,10))){
            try{
                var props=new MessageProperties();props.setContentType(MessageProperties.CONTENT_TYPE_JSON);props.setContentEncoding("UTF-8");props.setMessageId(event.eventId);props.setType(event.eventType);props.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
                var correlation=new CorrelationData(event.eventId);
                rabbit.send(OrderMessagingConfig.EXCHANGE,event.eventType,new Message(json.writeValueAsBytes(event.payload),props),correlation);
                if(!correlation.getFuture().get(5,TimeUnit.SECONDS).isAck()||correlation.getReturned()!=null)throw new IllegalStateException("Event not routed or not confirmed");
                event.status="Published";event.publishedAt=LocalDateTime.now(ZoneOffset.UTC);event.lastError=null;event.nextRetryAt=null;
            }catch(Exception ex){
                event.retryCount++;event.lastError=ex.getClass().getSimpleName();event.nextRetryAt=LocalDateTime.now(ZoneOffset.UTC).plusSeconds(Math.min(300,1L<<Math.min(event.retryCount,8)));
                log.warn("Order event deferred: eventId={}, attempt={}, error={}",event.eventId,event.retryCount,event.lastError);
                if(ex instanceof InterruptedException){Thread.currentThread().interrupt();return;}
            }
        }
    }
}
