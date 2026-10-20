package com.smart_cafe_ai.engagement_service.controller;

import com.smart_cafe_ai.engagement_service.model.Notification;
import com.smart_cafe_ai.engagement_service.repository.NotificationRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;

/** Internal diagnostics only; not exposed by the API Gateway's notification route. */
@RestController
@RequestMapping("/api/v1/internal/notifications")
public class NotificationController {
    private final NotificationRepository repository;
    private final String internalToken;

    public NotificationController(NotificationRepository repository,
            @Value("${app.notifications.internal-token:}") String internalToken) {
        this.repository = repository;
        this.internalToken = internalToken;
    }

    @GetMapping("/{eventId}")
    public NotificationStatusResponse getStatus(@PathVariable String eventId,
            @RequestHeader(value = "X-Internal-Token", defaultValue = "") String token) {
        if (internalToken.isBlank() || !MessageDigest.isEqual(internalToken.getBytes(StandardCharsets.UTF_8),
                token.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        Notification row = repository.findByEventId(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return new NotificationStatusResponse(row.getEventId(), row.getStatus(), row.getAttemptCount(),
                row.getLastError(), row.getCreatedAt(), row.getSentAt());
    }

    public record NotificationStatusResponse(String eventId, Notification.Status status, int attemptCount,
            String lastError, Instant createdAt, Instant sentAt) { }
}
