package com.smart_cafe_ai.identity_service.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.identity_service.dto.event.OtpEmailEvent;
import com.smart_cafe_ai.identity_service.model.OutboxEvent;
import com.smart_cafe_ai.identity_service.repository.OutboxEventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OtpEmailOutboxService {
    public static final String EVENT_TYPE = "OtpEmailRequested";
    private final OutboxEventRepository repository;
    private final ObjectMapper objectMapper;

    public OtpEmailOutboxService(OutboxEventRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    // The OTP and the delivery request commit or roll back together.
    @Transactional(propagation = Propagation.MANDATORY)
    public void enqueue(OtpEmailEvent event) {
        try {
            repository.save(OutboxEvent.builder()
                    .eventId(event.eventId()).aggregateType("Otp")
                    .aggregateId(event.userId() == null ? event.eventId() : event.userId())
                    .eventType(EVENT_TYPE).payload(objectMapper.writeValueAsString(event)).build());
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Could not serialize OTP email event");
        }
    }
}
