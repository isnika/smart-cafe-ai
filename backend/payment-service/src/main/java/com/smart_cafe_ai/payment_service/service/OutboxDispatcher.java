package com.smart_cafe_ai.payment_service.service;

import com.smart_cafe_ai.payment_service.entity.OutboxEvent;
import com.smart_cafe_ai.payment_service.enums.OutboxStatus;
import com.smart_cafe_ai.payment_service.repository.OutboxEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.AmqpTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class OutboxDispatcher {

    private final OutboxEventRepository outboxEventRepository;
    private final AmqpTemplate amqpTemplate;

    @Value("${rabbitmq.exchange.payment:smartcafe.payment.exchange}")
    private String paymentExchange;

    @Scheduled(fixedDelayString = "${outbox.dispatcher.interval:5000}")
    @Transactional
    public void dispatchEvents() {
        LocalDateTime now = LocalDateTime.now();
        List<OutboxEvent> pendingEvents = outboxEventRepository.findPendingEventsToPublish(
                OutboxStatus.Pending,
                now,
                PageRequest.of(0, 50)
        );

        if (pendingEvents.isEmpty()) {
            return;
        }

        log.debug("Found {} pending outbox events to dispatch", pendingEvents.size());

        for (OutboxEvent event : pendingEvents) {
            try {
                String routingKey = mapEventTypeToRoutingKey(event.getEventType());
                amqpTemplate.convertAndSend(paymentExchange, routingKey, event.getPayload());

                event.setStatus(OutboxStatus.Published);
                event.setPublishedAt(LocalDateTime.now());
                log.info("Dispatched outbox event {} (type={}) successfully", event.getEventId(), event.getEventType());
            } catch (Exception ex) {
                log.error("Failed to dispatch outbox event {}: {}", event.getEventId(), ex.getMessage());
                event.setRetryCount(event.getRetryCount() + 1);
                event.setLastError(ex.getMessage() != null && ex.getMessage().length() > 500 ? ex.getMessage().substring(0, 500) : ex.getMessage());

                if (event.getRetryCount() >= 5) {
                    event.setStatus(OutboxStatus.Failed);
                } else {
                    // Exponential backoff: 10s, 30s, 1m, 2m
                    long backoffSeconds = (long) Math.pow(2, event.getRetryCount()) * 5;
                    event.setNextRetryAt(now.plusSeconds(backoffSeconds));
                }
            }
            outboxEventRepository.save(event);
        }
    }

    private String mapEventTypeToRoutingKey(String eventType) {
        return switch (eventType) {
            case "PaymentSucceeded" -> "payment.succeeded";
            case "PaymentFailed" -> "payment.failed";
            case "RefundProcessed" -> "refund.processed";
            default -> "payment.general";
        };
    }
}
