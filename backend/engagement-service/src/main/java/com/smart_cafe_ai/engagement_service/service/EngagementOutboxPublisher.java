package com.smart_cafe_ai.engagement_service.service;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.engagement_service.config.EngagementMessagingConfig;
import com.smart_cafe_ai.engagement_service.repository.OutboxEventRepository;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.concurrent.TimeUnit;
@Component @ConditionalOnProperty(name="app.engagement.publisher-enabled",havingValue="true",matchIfMissing=true)
public class EngagementOutboxPublisher {
    private final OutboxEventRepository repository;
    private final RabbitTemplate rabbit;
    private final ObjectMapper json;
    public EngagementOutboxPublisher(OutboxEventRepository repository,RabbitTemplate rabbit,ObjectMapper json) { this.repository=repository; this.rabbit=rabbit; this.json=json; }
    @Scheduled(fixedDelayString="${app.engagement.publish-delay-ms:1000}") @Transactional
    public void publish() {
        for(var e:repository.ready(Instant.now(),PageRequest.of(0,10))) {
            try {
                var props=new MessageProperties(); props.setContentType(MessageProperties.CONTENT_TYPE_JSON); props.setContentEncoding("UTF-8");
                props.setMessageId(e.eventId); props.setType(e.eventType); props.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
                var envelope=new java.util.LinkedHashMap<String,Object>(); envelope.put("event_id",e.eventId); envelope.put("event_type",e.eventType);
                envelope.put("event_version",e.eventVersion); envelope.put("aggregate_type",e.aggregateType); envelope.put("aggregate_id",e.aggregateId);
                envelope.put("correlation_id",e.correlationId); envelope.put("occurred_at",e.createdAt.toString()); envelope.put("payload",e.payload);
                var correlation=new CorrelationData(e.eventId);
                rabbit.send(EngagementMessagingConfig.EXCHANGE,e.eventType,new Message(json.writeValueAsBytes(envelope),props),correlation);
                if(!correlation.getFuture().get(5,TimeUnit.SECONDS).isAck()||correlation.getReturned()!=null) throw new IllegalStateException("Event not routed or not confirmed");
                e.status="Published"; e.publishedAt=Instant.now(); e.nextRetryAt=null; e.lastError=null;
            } catch(Exception ex) {
                e.status="Failed"; e.retryCount++; e.lastError=ex.getClass().getSimpleName(); e.nextRetryAt=Instant.now().plusSeconds(Math.min(300,1L<<Math.min(e.retryCount,8)));
                org.slf4j.LoggerFactory.getLogger(getClass()).warn("Engagement event deferred: eventId={}, attempt={}, error={}",e.eventId,e.retryCount,e.lastError);
                if(ex instanceof InterruptedException) { Thread.currentThread().interrupt(); return; }
            }
        }
    }
}
