package com.smart_cafe_ai.inventory_service.messaging;

import com.smart_cafe_ai.inventory_service.config.RabbitMQConfig;
import com.smart_cafe_ai.inventory_service.entity.OutboxEvent;
import com.smart_cafe_ai.inventory_service.enums.OutboxStatus;
import com.smart_cafe_ai.inventory_service.repository.OutboxEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Polls the Outbox_Events table every 2 seconds and publishes pending events to RabbitMQ.
 * Implements the Transactional Outbox Pattern for reliable event publishing.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class OutboxEventPublisher {

    private final OutboxEventRepository outboxEventRepository;
    private final RabbitTemplate rabbitTemplate;

    @Scheduled(fixedDelay = 2000)
    @Transactional
    public void publishPendingEvents() {
        List<OutboxEvent> pendingEvents = outboxEventRepository
                .findTop50ByStatusOrderByCreatedAtAsc(OutboxStatus.Pending);

        if (pendingEvents.isEmpty()) {
            return;
        }

        log.debug("Found {} pending outbox events to publish", pendingEvents.size());

        for (OutboxEvent event : pendingEvents) {
            try {
                rabbitTemplate.convertAndSend(
                        RabbitMQConfig.INVENTORY_EVENTS_EXCHANGE,
                        event.getRoutingKey(),
                        event.getPayload()
                );

                event.setStatus(OutboxStatus.Published);
                event.setPublishedAt(LocalDateTime.now());
                outboxEventRepository.save(event);

                log.info("Published outbox event: id={}, type={}, routingKey={}",
                        event.getId(), event.getEventType(), event.getRoutingKey());
            } catch (Exception e) {
                log.error("Failed to publish outbox event: id={}, type={}", event.getId(), event.getEventType(), e);
                event.setStatus(OutboxStatus.Failed);
                event.setErrorMessage(e.getMessage());
                outboxEventRepository.save(event);
            }
        }
    }

    /**
     * Retry failed events every 30 seconds.
     */
    @Scheduled(fixedDelay = 30000)
    @Transactional
    public void retryFailedEvents() {
        List<OutboxEvent> failedEvents = outboxEventRepository
                .findTop50ByStatusOrderByCreatedAtAsc(OutboxStatus.Failed);

        if (failedEvents.isEmpty()) {
            return;
        }

        log.info("Retrying {} failed outbox events", failedEvents.size());

        for (OutboxEvent event : failedEvents) {
            try {
                rabbitTemplate.convertAndSend(
                        RabbitMQConfig.INVENTORY_EVENTS_EXCHANGE,
                        event.getRoutingKey(),
                        event.getPayload()
                );

                event.setStatus(OutboxStatus.Published);
                event.setPublishedAt(LocalDateTime.now());
                event.setErrorMessage(null);
                outboxEventRepository.save(event);

                log.info("Retry succeeded for outbox event: id={}, type={}", event.getId(), event.getEventType());
            } catch (Exception e) {
                log.error("Retry failed for outbox event: id={}, type={}", event.getId(), event.getEventType(), e);
                event.setErrorMessage(e.getMessage());
                outboxEventRepository.save(event);
            }
        }
    }
}
