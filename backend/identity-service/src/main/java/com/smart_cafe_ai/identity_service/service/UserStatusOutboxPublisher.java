package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.config.IdentityEventsConfig;
import com.smart_cafe_ai.identity_service.model.OutboxEvent;
import com.smart_cafe_ai.identity_service.repository.OutboxEventRepository;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.concurrent.TimeUnit;

@Component
@ConditionalOnProperty(name = "app.identity-events.publisher-enabled", havingValue = "true", matchIfMissing = true)
public class UserStatusOutboxPublisher {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(UserStatusOutboxPublisher.class);
    private final OutboxEventRepository outbox;
    private final RabbitTemplate rabbit;

    public UserStatusOutboxPublisher(OutboxEventRepository outbox, RabbitTemplate rabbit) {
        this.outbox = outbox;
        this.rabbit = rabbit;
    }

    @Scheduled(fixedDelayString = "${app.identity-events.publish-delay-ms:1000}")
    @Transactional
    public void publishPending() {
        for (var row : outbox.findReadyUserStatusEvents(UserStatusEvents.TYPES,
                OutboxEvent.OutboxStatus.Pending, LocalDateTime.now(), PageRequest.of(0, 10))) {
            try {
                var props = new MessageProperties();
                props.setContentType(MessageProperties.CONTENT_TYPE_JSON);
                props.setContentEncoding("UTF-8");
                props.setMessageId(row.getEventId());
                props.setType(row.getEventType());
                props.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
                var correlation = new CorrelationData(row.getEventId());
                rabbit.send(IdentityEventsConfig.EXCHANGE, row.getEventType(),
                        new Message(row.getPayload().getBytes(StandardCharsets.UTF_8), props), correlation);
                if (!correlation.getFuture().get(5, TimeUnit.SECONDS).isAck() || correlation.getReturned() != null)
                    throw new IllegalStateException("User status event not routed or confirmed");
                row.setStatus(OutboxEvent.OutboxStatus.Published);
                row.setPublishedAt(LocalDateTime.now());
                row.setNextRetryAt(null);
                row.setLastError(null);
            } catch (Exception ex) {
                row.setRetryCount(row.getRetryCount() + 1);
                row.setNextRetryAt(LocalDateTime.now().plusSeconds(Math.min(300, 1L << Math.min(row.getRetryCount(), 8))));
                row.setLastError(ex.getClass().getSimpleName());
                log.warn("User status publication deferred: eventId={}, attempt={}", row.getEventId(), row.getRetryCount());
                if (ex instanceof InterruptedException) { Thread.currentThread().interrupt(); return; }
            }
        }
    }
}
