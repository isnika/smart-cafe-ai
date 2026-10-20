package com.smart_cafe_ai.engagement_service.service;

import com.smart_cafe_ai.engagement_service.dto.OtpEmailEvent;
import com.smart_cafe_ai.engagement_service.model.Notification;
import com.smart_cafe_ai.engagement_service.repository.NotificationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import java.time.Instant;

@Service
public class NotificationService {
    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);
    private final NotificationRepository repository;
    private final EmailService emailService;

    public NotificationService(NotificationRepository repository, EmailService emailService) {
        this.repository = repository;
        this.emailService = emailService;
    }

    // Each repository write commits separately so FAILED survives listener retry/exception.
    // The consumer runs on a single active RabbitMQ consumer to serialize duplicate deliveries.
    public void sendOtpEmail(OtpEmailEvent event) {
        Notification notification = repository.findByEventId(event.eventId()).orElseGet(() ->
                repository.saveAndFlush(new Notification(event.eventId(), event.userId(), event.email(),
                        event.purpose(), event.expiresAt())));
        if (notification.getStatus() == Notification.Status.SENT
                || notification.getStatus() == Notification.Status.EXPIRED) {
            return;
        }
        if (!event.expiresAt().isAfter(Instant.now())) {
            notification.setStatus(Notification.Status.EXPIRED);
            notification.setLastError("OTP expired before email delivery");
            repository.saveAndFlush(notification);
            return;
        }
        notification.setAttemptCount(notification.getAttemptCount() + 1);
        notification.setStatus(Notification.Status.PENDING);
        notification.setLastError(null);
        repository.saveAndFlush(notification);
        try {
            emailService.sendOtpEmail(event);
        } catch (RuntimeException ex) {
            notification.setStatus(Notification.Status.FAILED);
            // SMTP exceptions can contain recipient/credentials; retain only the error class.
            notification.setLastError(ex.getClass().getSimpleName());
            repository.saveAndFlush(notification);
            log.warn("OTP email failed: eventId={}, attempt={}, error={}", event.eventId(),
                    notification.getAttemptCount(), ex.getClass().getSimpleName());
            throw new IllegalStateException("OTP email delivery failed; eventId=" + event.eventId());
        }
        notification.setStatus(Notification.Status.SENT);
        notification.setSentAt(Instant.now());
        repository.saveAndFlush(notification);
        log.info("OTP email accepted by SMTP: eventId={}", event.eventId());
    }
}
