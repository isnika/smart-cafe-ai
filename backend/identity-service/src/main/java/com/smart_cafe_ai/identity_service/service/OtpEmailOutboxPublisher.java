package com.smart_cafe_ai.identity_service.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.identity_service.config.RabbitMQConfig;
import com.smart_cafe_ai.identity_service.dto.event.OtpEmailEvent;
import com.smart_cafe_ai.identity_service.model.OutboxEvent;
import com.smart_cafe_ai.identity_service.repository.OutboxEventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.concurrent.TimeUnit;

@Component
@ConditionalOnProperty(name = "app.otp-email.publisher-enabled", havingValue = "true", matchIfMissing = true)
public class OtpEmailOutboxPublisher {
    private static final Logger log = LoggerFactory.getLogger(OtpEmailOutboxPublisher.class);
    private final OutboxEventRepository repository;
    private final RabbitTemplate rabbitTemplate;
    private final ObjectMapper objectMapper;

    public OtpEmailOutboxPublisher(OutboxEventRepository repository, RabbitTemplate rabbitTemplate,
                                  ObjectMapper objectMapper) {
        this.repository = repository;
        this.rabbitTemplate = rabbitTemplate;
        this.objectMapper = objectMapper;
    }

    @Scheduled(fixedDelayString = "${app.otp-email.publish-delay-ms:1000}")
    @Transactional
    public void publishPending() {
        // Bound the transaction and hold a DB lock to coordinate multiple Identity instances.
        for (OutboxEvent row : repository.findReadyOtpEmails(OtpEmailOutboxService.EVENT_TYPE,
                OutboxEvent.OutboxStatus.Pending, LocalDateTime.now(), PageRequest.of(0, 10))) {
            try {
                OtpEmailEvent event = objectMapper.readValue(row.getPayload(), OtpEmailEvent.class);
                long remainingMillis = Duration.between(Instant.now(), event.expiresAt()).toMillis();
                if (remainingMillis <= 0) {
                    row.setStatus(OutboxEvent.OutboxStatus.Failed);
                    row.setLastError("OTP expired before publication");
                    row.setPayload("{}");
                } else {
                    MessageProperties properties = new MessageProperties();
                    properties.setContentType(MessageProperties.CONTENT_TYPE_JSON);
                    properties.setContentEncoding(StandardCharsets.UTF_8.name());
                    properties.setMessageId(event.eventId());
                    properties.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
                    properties.setExpiration(Long.toString(remainingMillis));
                    CorrelationData correlation = new CorrelationData(event.eventId());
                    rabbitTemplate.send(RabbitMQConfig.EXCHANGE, RabbitMQConfig.ROUTING_KEY,
                            new Message(row.getPayload().getBytes(StandardCharsets.UTF_8), properties), correlation);
                    if (!correlation.getFuture().get(5, TimeUnit.SECONDS).isAck()
                            || correlation.getReturned() != null) {
                        throw new IllegalStateException("OTP email was not routed and confirmed");
                    }
                    row.setStatus(OutboxEvent.OutboxStatus.Published);
                    row.setPublishedAt(LocalDateTime.now());
                    row.setLastError(null);
                    // Do not retain the plaintext OTP in the outbox after publishing.
                    row.setPayload("{}");
                    log.info("OTP email event published: eventId={}", event.eventId());
                }
            } catch (Exception ex) {
                if (ex instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                row.setRetryCount(row.getRetryCount() + 1);
                row.setNextRetryAt(LocalDateTime.now().plusSeconds(5));
                row.setLastError(ex.getClass().getSimpleName());
                log.warn("OTP email publication deferred: eventId={}, attempt={}, error={}",
                        row.getEventId(), row.getRetryCount(), ex.getClass().getSimpleName());
            }
            repository.save(row);
        }
    }
}
