package com.smart_cafe_ai.engagement_service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.engagement_service.config.EngagementMessagingConfig;
import com.smart_cafe_ai.engagement_service.model.OutboxEvent;
import com.smart_cafe_ai.engagement_service.repository.OutboxEventRepository;
import com.smart_cafe_ai.engagement_service.service.EngagementOutboxPublisher;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class EngagementOutboxPublisherTest {
    private void exercise(boolean ack,boolean returned) throws Exception {
        var repository=mock(OutboxEventRepository.class); var rabbit=mock(RabbitTemplate.class); var json=new ObjectMapper();
        var e=new OutboxEvent(); e.eventId=UUID.randomUUID().toString(); e.aggregateType="LoyaltyCard"; e.aggregateId="user";
        e.eventType="engagement.loyalty.earned"; e.payload=Map.of("user_id","user","stamps",2);
        when(repository.ready(any(),any())).thenReturn(List.of(e));
        doAnswer(invocation->{
            Message message=invocation.getArgument(2); CorrelationData correlation=invocation.getArgument(3);
            assertEquals(MessageDeliveryMode.PERSISTENT,message.getMessageProperties().getDeliveryMode());
            var body=json.readTree(message.getBody()); assertEquals(e.eventId,body.path("event_id").asText());
            assertEquals(2,body.path("payload").path("stamps").asInt());
            if(returned) correlation.setReturned(new ReturnedMessage(message,312,"NO_ROUTE",EngagementMessagingConfig.EXCHANGE,e.eventType));
            correlation.getFuture().complete(new CorrelationData.Confirm(ack,ack?null:"nack"));
            return null;
        }).when(rabbit).send(eq(EngagementMessagingConfig.EXCHANGE),eq(e.eventType),any(Message.class),any(CorrelationData.class));
        new EngagementOutboxPublisher(repository,rabbit,json).publish();
        if(ack&&!returned) { assertEquals("Published",e.status); assertNotNull(e.publishedAt); assertNull(e.nextRetryAt); }
        else { assertEquals("Failed",e.status); assertEquals(1,e.retryCount); assertNotNull(e.nextRetryAt); assertNull(e.publishedAt); }
    }
    @Test void marksPublishedOnlyAfterBrokerConfirmation() throws Exception { exercise(true,false); }
    @Test void brokerNackKeepsEventForRetry() throws Exception { exercise(false,false); }
    @Test void unroutableMessageIsRetainedEvenWhenBrokerAcknowledges() throws Exception { exercise(true,true); }
}
