package com.smart_cafe_ai.identity_service.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.identity_service.model.OutboxEvent;
import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.model.UserStatus;
import com.smart_cafe_ai.identity_service.repository.OutboxEventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class UserStatusEvents {
    public static final List<String> TYPES = List.of("identity.user.banned", "identity.user.deactivated",
            "identity.user.activated", "identity.user.status_changed");
    private final OutboxEventRepository outbox;
    private final ObjectMapper json;

    public UserStatusEvents(OutboxEventRepository outbox, ObjectMapper json) {
        this.outbox = outbox;
        this.json = json;
    }

    // Callers hold the user row lock: outbox IDs then order changes for this account.
    @Transactional(propagation = Propagation.MANDATORY)
    public void changed(User user, UserStatus previous) {
        if (previous == user.getStatus()) return;
        String type = switch (user.getStatus()) {
            case Banned -> TYPES.get(0);
            case Deactivated -> TYPES.get(1);
            case Active -> TYPES.get(2);
            case Unverified -> TYPES.get(3);
        };
        var row = outbox.saveAndFlush(OutboxEvent.builder().eventId(UUID.randomUUID().toString())
                .aggregateType("User").aggregateId(user.getId()).eventType(type).payload("{}").build());
        try {
            row.setPayload(json.writeValueAsString(Map.of(
                    "event_id", row.getEventId(), "event_type", type, "event_version", 1,
                    "user_id", user.getId(), "status", user.getStatus().name(),
                    "previous_status", previous.name(), "status_revision", row.getId(),
                    "occurred_at", Instant.now().toString())));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Could not serialize user status event", ex);
        }
    }
}
