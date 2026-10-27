package com.smart_cafe_ai.catalog_service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.catalog_service.model.*;
import com.smart_cafe_ai.catalog_service.repository.OutboxEventRepository;
import com.smart_cafe_ai.catalog_service.service.CatalogEventPublisher;
import org.junit.jupiter.api.*;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDateTime;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CatalogEventPublisherTest {
    OutboxEventRepository repository=mock(OutboxEventRepository.class);
    RabbitTemplate rabbit=mock(RabbitTemplate.class);
    ObjectMapper json=new ObjectMapper();
    CatalogEventPublisher publisher=new CatalogEventPublisher(repository,rabbit,json);
    OutboxEvent event;

    @BeforeEach void prepare() {
        Product product=mock(Product.class);
        when(product.getId()).thenReturn(1);when(product.getStatus()).thenReturn(MenuStatus.Inactive);
        when(product.getUpdatedAt()).thenReturn(LocalDateTime.of(2026,10,25,0,0));
        event=OutboxEvent.productStatusChanged(product);
        when(repository.findReadyEvents(anyCollection(),any(),any(),any())).thenReturn(List.of(event));
    }

    @Test void confirmedRoutedEventIsPersistentAndMarkedPublished() throws Exception {
        doAnswer(call -> {
            Message message=call.getArgument(2); CorrelationData confirmation=call.getArgument(3);
            assertEquals(event.getEventId(),message.getMessageProperties().getMessageId());
            assertEquals(MessageDeliveryMode.PERSISTENT,message.getMessageProperties().getDeliveryMode());
            assertEquals("Inactive",json.readTree(message.getBody()).get("status").asText());
            confirmation.getFuture().complete(new CorrelationData.Confirm(true,null));return null;
        }).when(rabbit).send(anyString(),anyString(),any(Message.class),any(CorrelationData.class));
        publisher.publishPending();
        assertEquals(OutboxEvent.Status.Published,event.getStatus());
        assertNotNull(event.getPublishedAt()); assertNull(event.getNextRetryAt());
    }

    @Test void brokerFailureKeepsSameEventPendingForRetry() {
        String eventId=event.getEventId();
        doThrow(new IllegalStateException("Broker offline")).when(rabbit)
                .send(anyString(),anyString(),any(Message.class),any(CorrelationData.class));
        publisher.publishPending();
        assertEquals(OutboxEvent.Status.Pending,event.getStatus()); assertEquals(1,event.getRetryCount());
        assertNotNull(event.getNextRetryAt()); assertEquals(eventId,event.getEventId());
    }

    @Test void returnedMessageIsNeverMarkedPublishedEvenIfBrokerAcked() {
        doAnswer(call -> {
            CorrelationData confirmation=call.getArgument(3);
            confirmation.setReturned(new ReturnedMessage(call.getArgument(2),312,"NO_ROUTE","smart-cafe.catalog",event.getEventType()));
            confirmation.getFuture().complete(new CorrelationData.Confirm(true,null)); return null;
        }).when(rabbit).send(anyString(),anyString(),any(Message.class),any(CorrelationData.class));
        publisher.publishPending();
        assertEquals(OutboxEvent.Status.Pending,event.getStatus()); assertEquals(1,event.getRetryCount());
    }

    @Test void nackIsRetried() {
        doAnswer(call -> {
            CorrelationData confirmation=call.getArgument(3);
            confirmation.getFuture().complete(new CorrelationData.Confirm(false,"nack"));return null;
        }).when(rabbit).send(anyString(),anyString(),any(Message.class),any(CorrelationData.class));
        publisher.publishPending(); assertEquals(OutboxEvent.Status.Pending,event.getStatus());
    }
}
