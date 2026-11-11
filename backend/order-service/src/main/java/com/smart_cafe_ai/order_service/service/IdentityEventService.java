package com.smart_cafe_ai.order_service.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.smart_cafe_ai.order_service.model.IdentityUserStatus;
import com.smart_cafe_ai.order_service.model.ProcessedEvent;
import com.smart_cafe_ai.order_service.repository.IdentityUserStatusRepository;
import com.smart_cafe_ai.order_service.repository.ProcessedEventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
public class IdentityEventService {
    private static final Map<String, String> STATUS_BY_TYPE = Map.of(
            "identity.user.banned", "Banned", "identity.user.deactivated", "Deactivated",
            "identity.user.activated", "Active", "identity.user.status_changed", "Unverified");
    private final IdentityUserStatusRepository statuses;
    private final ProcessedEventRepository processed;

    public IdentityEventService(IdentityUserStatusRepository statuses, ProcessedEventRepository processed) {
        this.statuses = statuses;
        this.processed = processed;
    }

    @Transactional
    public void accept(String routingKey, JsonNode event) {
        if (event == null || !event.isObject()) throw new IllegalArgumentException("Invalid Identity event");
        String id = text(event, "event_id"), type = text(event, "event_type");
        if (!UUID.fromString(id).toString().equalsIgnoreCase(id)) throw new IllegalArgumentException("Invalid event_id");
        if (!type.equals(routingKey) || !STATUS_BY_TYPE.containsKey(type)
                || !event.path("event_version").isIntegralNumber() || event.path("event_version").asInt() != 1)
            throw new IllegalArgumentException("Unsupported Identity event contract");
        String user = text(event, "user_id"), status = text(event, "status");
        var revision = event.path("status_revision");
        if (user.length() > 36 || !STATUS_BY_TYPE.get(type).equals(status)
                || !revision.isIntegralNumber() || !revision.canConvertToLong() || revision.longValue() <= 0)
            throw new IllegalArgumentException("Invalid user status");
        Instant occurredAt = Instant.parse(text(event, "occurred_at"));
        var oldEvent = processed.findById(id);
        if (oldEvent.isPresent()) {
            if (!type.equals(oldEvent.get().eventType) || !"identity-service".equals(oldEvent.get().sourceService))
                throw new IllegalArgumentException("Conflicting event_id");
            return;
        }
        var row = statuses.lockByUserId(user).orElseGet(IdentityUserStatus::new);
        if (row.userId == null || revision.longValue() > row.statusRevision) {
            row.userId = user;
            row.status = status;
            row.statusRevision = revision.longValue();
            row.occurredAt = occurredAt;
            statuses.save(row);
        }
        var marker = new ProcessedEvent();
        marker.eventId = id;
        marker.eventType = type;
        marker.sourceService = "identity-service";
        processed.saveAndFlush(marker);
    }

    private String text(JsonNode event, String name) {
        var value = event.get(name);
        if (value == null || !value.isTextual() || value.textValue().isBlank())
            throw new IllegalArgumentException("Missing " + name);
        return value.textValue();
    }
}
