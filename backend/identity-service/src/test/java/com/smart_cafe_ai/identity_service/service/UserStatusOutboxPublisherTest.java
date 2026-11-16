package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.config.IdentityEventsConfig;
import com.smart_cafe_ai.identity_service.model.OutboxEvent;
import com.smart_cafe_ai.identity_service.repository.OutboxEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import java.util.List;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class UserStatusOutboxPublisherTest {
    private final OutboxEventRepository outbox = mock(OutboxEventRepository.class);
    private final RabbitTemplate rabbit = mock(RabbitTemplate.class);
    private final UserStatusOutboxPublisher publisher = new UserStatusOutboxPublisher(outbox, rabbit);
    private OutboxEvent row;

    @BeforeEach void setup() {
        row = OutboxEvent.builder().eventId(UUID.randomUUID().toString())
                .eventType("identity.user.banned").payload("{\"user_id\":\"user-1\"}").build();
        when(outbox.findReadyUserStatusEvents(anyList(), any(), any(), any())).thenReturn(List.of(row));
    }

    @Test void marksPublishedOnlyAfterConfirmationAndPreservesPayloadForReplay() {
        doAnswer(call -> {
            Message message = call.getArgument(2);
            assertEquals(row.getEventId(), message.getMessageProperties().getMessageId());
            assertEquals(row.getEventType(), message.getMessageProperties().getType());
            assertEquals(MessageDeliveryMode.PERSISTENT, message.getMessageProperties().getDeliveryMode());
            CorrelationData correlation = call.getArgument(3);
            correlation.getFuture().complete(new CorrelationData.Confirm(true, null));
            return null;
        }).when(rabbit).send(eq(IdentityEventsConfig.EXCHANGE), eq(row.getEventType()), any(Message.class), any(CorrelationData.class));
        publisher.publishPending();
        assertEquals(OutboxEvent.OutboxStatus.Published, row.getStatus());
        assertNotNull(row.getPublishedAt());
        assertTrue(row.getPayload().contains("user-1"));
    }

    @Test void outageKeepsEventPendingWithSameIdForRetry() {
        String id = row.getEventId();
        doThrow(new org.springframework.amqp.AmqpException("offline")).when(rabbit)
                .send(anyString(), anyString(), any(Message.class), any(CorrelationData.class));
        publisher.publishPending();
        assertEquals(OutboxEvent.OutboxStatus.Pending, row.getStatus());
        assertEquals(id, row.getEventId());
        assertEquals(1, row.getRetryCount());
        assertNotNull(row.getNextRetryAt());
    }

    @Test void unroutableAcknowledgementStillRetries() {
        doAnswer(call -> {
            CorrelationData correlation = call.getArgument(3);
            correlation.setReturned(new ReturnedMessage(call.getArgument(2), 312, "NO_ROUTE", IdentityEventsConfig.EXCHANGE, row.getEventType()));
            correlation.getFuture().complete(new CorrelationData.Confirm(true, null));
            return null;
        }).when(rabbit).send(anyString(), anyString(), any(Message.class), any(CorrelationData.class));
        publisher.publishPending();
        assertEquals(OutboxEvent.OutboxStatus.Pending, row.getStatus());
        assertEquals(1, row.getRetryCount());
    }
}
