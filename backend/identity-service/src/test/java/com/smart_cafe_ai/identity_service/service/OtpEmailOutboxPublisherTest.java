package com.smart_cafe_ai.identity_service.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.identity_service.config.RabbitMQConfig;
import com.smart_cafe_ai.identity_service.dto.event.OtpEmailEvent;
import com.smart_cafe_ai.identity_service.model.OutboxEvent;
import com.smart_cafe_ai.identity_service.repository.OutboxEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.AmqpConnectException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.ReturnedMessage;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class OtpEmailOutboxPublisherTest {
    private final OutboxEventRepository repository = mock(OutboxEventRepository.class);
    private final RabbitTemplate rabbit = mock(RabbitTemplate.class);
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final OtpEmailOutboxPublisher publisher = new OtpEmailOutboxPublisher(repository, rabbit, mapper);
    private OutboxEvent row;

    @BeforeEach
    void setUp() throws Exception {
        OtpEmailEvent event = new OtpEmailEvent(UUID.randomUUID().toString(), "user-1",
                "customer@example.com", "012345", "Register", Instant.now().plusSeconds(300));
        row = OutboxEvent.builder().eventId(event.eventId()).eventType(OtpEmailOutboxService.EVENT_TYPE)
                .payload(mapper.writeValueAsString(event)).build();
        when(repository.findReadyOtpEmails(anyString(), any(), any(), any())).thenReturn(List.of(row));
    }

    @Test
    void confirmsBeforeMarkingPublishedAndScrubsPlaintext() {
        doAnswer(invocation -> {
            Message message = invocation.getArgument(2);
            assertTrue(Long.parseLong(message.getMessageProperties().getExpiration()) > 0);
            CorrelationData correlation = invocation.getArgument(3);
            correlation.getFuture().complete(new CorrelationData.Confirm(true, null));
            return null;
        }).when(rabbit).send(eq(RabbitMQConfig.EXCHANGE), eq(RabbitMQConfig.ROUTING_KEY),
                any(Message.class), any(CorrelationData.class));

        publisher.publishPending();
        assertEquals(OutboxEvent.OutboxStatus.Published, row.getStatus());
        assertEquals("{}", row.getPayload());
        assertNotNull(row.getPublishedAt());
    }

    @Test
    void brokerOutageKeepsRequestForRetry() {
        doThrow(new AmqpConnectException(new java.net.ConnectException("unavailable")))
                .when(rabbit).send(anyString(), anyString(), any(Message.class), any(CorrelationData.class));
        publisher.publishPending();
        assertEquals(OutboxEvent.OutboxStatus.Pending, row.getStatus());
        assertEquals(1, row.getRetryCount());
        assertNotNull(row.getNextRetryAt());
        assertTrue(row.getPayload().contains("012345"));
    }

    @Test
    void returnedMessageIsRetriedEvenWhenBrokerAcknowledgedIt() {
        doAnswer(invocation -> {
            CorrelationData correlation = invocation.getArgument(3);
            correlation.setReturned(new ReturnedMessage(invocation.getArgument(2), 312, "NO_ROUTE",
                    RabbitMQConfig.EXCHANGE, RabbitMQConfig.ROUTING_KEY));
            correlation.getFuture().complete(new CorrelationData.Confirm(true, null));
            return null;
        }).when(rabbit).send(anyString(), anyString(), any(Message.class), any(CorrelationData.class));
        publisher.publishPending();
        assertEquals(OutboxEvent.OutboxStatus.Pending, row.getStatus());
        assertEquals(1, row.getRetryCount());
    }

    @Test
    void expiredRequestIsScrubbedWithoutPublishing() throws Exception {
        OtpEmailEvent expired = new OtpEmailEvent(row.getEventId(), "user-1", "customer@example.com",
                "012345", "Register", Instant.now().minusSeconds(1));
        row.setPayload(mapper.writeValueAsString(expired));
        publisher.publishPending();
        assertEquals(OutboxEvent.OutboxStatus.Failed, row.getStatus());
        assertEquals("{}", row.getPayload());
        verifyNoInteractions(rabbit);
    }
}
