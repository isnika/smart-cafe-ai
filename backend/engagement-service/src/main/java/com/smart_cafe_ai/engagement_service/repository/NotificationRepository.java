package com.smart_cafe_ai.engagement_service.repository;

import com.smart_cafe_ai.engagement_service.model.Notification;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    Optional<Notification> findByEventId(String eventId);
}
