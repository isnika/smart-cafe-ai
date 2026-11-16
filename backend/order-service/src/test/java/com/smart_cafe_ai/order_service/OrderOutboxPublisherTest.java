package com.smart_cafe_ai.order_service;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.order_service.model.OutboxEvent;
import com.smart_cafe_ai.order_service.repository.OutboxRepository;
import com.smart_cafe_ai.order_service.service.OrderOutboxPublisher;
import org.junit.jupiter.api.*;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class OrderOutboxPublisherTest {
    OutboxRepository repository;
    RabbitTemplate rabbit;
    OutboxEvent event;
    OrderOutboxPublisher publisher;
    @BeforeEach void setup(){repository=mock(OutboxRepository.class);rabbit=mock(RabbitTemplate.class);publisher=new OrderOutboxPublisher(repository,rabbit,new ObjectMapper());
        event=new OutboxEvent();event.eventId=UUID.randomUUID().toString();event.eventType="order.created";event.payload=Map.of("event_id",event.eventId);when(repository.ready(any(),any())).thenReturn(List.of(event));}
    @Test void persistentConfirmedMessageIsPublished(){
        doAnswer(i->{Message m=i.getArgument(2);assertThat(m.getMessageProperties().getDeliveryMode()).isEqualTo(MessageDeliveryMode.PERSISTENT);assertThat(m.getMessageProperties().getMessageId()).isEqualTo(event.eventId);CorrelationData c=i.getArgument(3);c.getFuture().complete(new CorrelationData.Confirm(true,null));return null;}).when(rabbit).send(eq("smart-cafe.order"),eq("order.created"),any(Message.class),any(CorrelationData.class));
        publisher.publish();assertThat(event.status).isEqualTo("Published");assertThat(event.publishedAt).isNotNull();
    }
    @Test void brokerFailureKeepsEventForRetry(){
        doThrow(new IllegalStateException("offline")).when(rabbit).send(anyString(),anyString(),any(Message.class),any(CorrelationData.class));publisher.publish();
        assertThat(event.status).isEqualTo("Pending");assertThat(event.retryCount).isEqualTo(1);assertThat(event.nextRetryAt).isNotNull();
    }
    @Test void nackKeepsEventForRetry(){
        doAnswer(i->{CorrelationData c=i.getArgument(3);c.getFuture().complete(new CorrelationData.Confirm(false,"nack"));return null;}).when(rabbit).send(anyString(),anyString(),any(Message.class),any(CorrelationData.class));publisher.publish();assertThat(event.status).isEqualTo("Pending");
    }
    @Test void unroutedMessageIsRetriedEvenWithAck(){
        doAnswer(i->{CorrelationData c=i.getArgument(3);c.setReturned(new ReturnedMessage(i.getArgument(2),312,"NO_ROUTE","smart-cafe.order","order.created"));c.getFuture().complete(new CorrelationData.Confirm(true,null));return null;}).when(rabbit).send(anyString(),anyString(),any(Message.class),any(CorrelationData.class));publisher.publish();assertThat(event.status).isEqualTo("Pending");
    }
}
