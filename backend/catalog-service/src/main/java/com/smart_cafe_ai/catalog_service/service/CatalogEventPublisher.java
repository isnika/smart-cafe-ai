package com.smart_cafe_ai.catalog_service.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.catalog_service.config.CatalogEventsConfig;
import com.smart_cafe_ai.catalog_service.model.OutboxEvent;
import com.smart_cafe_ai.catalog_service.repository.OutboxEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.concurrent.TimeUnit;

@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(name = "app.catalog-events.publisher-enabled", havingValue = "true", matchIfMissing = true)
public class CatalogEventPublisher {
    private final OutboxEventRepository outbox;
    private final RabbitTemplate rabbit;
    private final ObjectMapper json;

    @Scheduled(fixedDelayString = "${app.catalog-events.publish-delay-ms:1000}")
    @Transactional
    public void publishPending() {
        // Row locks coordinate publisher instances. Only the oldest pending event per product is eligible.
        for (var event : outbox.findReadyEvents(java.util.List.of(OutboxEvent.PRODUCT_STATUS_CHANGED,OutboxEvent.VARIANT_PRICE_CHANGED), OutboxEvent.Status.Pending,
                LocalDateTime.now(ZoneOffset.UTC), PageRequest.of(0, 10))) {
            try {
                var properties = new MessageProperties();
                properties.setContentType(MessageProperties.CONTENT_TYPE_JSON);
                properties.setContentEncoding(StandardCharsets.UTF_8.name());
                properties.setMessageId(event.getEventId());
                properties.setType(event.getEventType());
                properties.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
                var confirmation = new CorrelationData(event.getEventId());
                rabbit.send(CatalogEventsConfig.EXCHANGE, event.getEventType(),
                        new Message(json.writeValueAsBytes(event.getPayload()), properties), confirmation);
                if (!confirmation.getFuture().get(5, TimeUnit.SECONDS).isAck() || confirmation.getReturned() != null)
                    throw new IllegalStateException("Catalog event was not routed and confirmed");
                event.published();
            } catch (Exception ex) {
                event.retry(ex);
                log.warn("Catalog event publication deferred: eventId={}, attempt={}, error={}",
                        event.getEventId(), event.getRetryCount(), ex.getClass().getSimpleName());
                if (ex instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }
}
