package com.smart_cafe_ai.payment_service.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.payment_service.entity.OutboxEvent;
import com.smart_cafe_ai.payment_service.enums.OutboxStatus;
import com.smart_cafe_ai.payment_service.repository.OutboxEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class OutboxService {

    private final OutboxEventRepository outboxEventRepository;
    private final ObjectMapper objectMapper;

    /**
     * Ghi sự kiện vào Outbox_Events TRONG CÙNG TRANSACTION với entity nghiệp vụ.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordEvent(String aggregateType, String aggregateId, String eventType, Object payload) {
        try {
            String payloadJson = objectMapper.writeValueAsString(payload);
            OutboxEvent event = OutboxEvent.builder()
                    .eventId(UUID.randomUUID().toString())
                    .aggregateType(aggregateType)
                    .aggregateId(aggregateId)
                    .eventType(eventType)
                    .eventVersion(1)
                    .payload(payloadJson)
                    .status(OutboxStatus.Pending)
                    .retryCount(0)
                    .createdAt(LocalDateTime.now())
                    .build();

            outboxEventRepository.save(event);
            log.info("Saved outbox event: type={}, aggregateId={}", eventType, aggregateId);
        } catch (Exception e) {
            log.error("Failed to serialize outbox event payload: {}", e.getMessage(), e);
            throw new RuntimeException("Lỗi ghi nhận outbox event: " + e.getMessage());
        }
    }
}
