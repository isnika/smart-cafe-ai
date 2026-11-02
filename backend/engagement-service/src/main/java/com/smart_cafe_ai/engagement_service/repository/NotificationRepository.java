package com.smart_cafe_ai.engagement_service.repository;

import com.smart_cafe_ai.engagement_service.model.Notification;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface NotificationRepository extends JpaRepository<Notification, Long>, org.springframework.data.jpa.repository.JpaSpecificationExecutor<Notification> {
    Optional<Notification> findByEventId(String eventId);
    Optional<Notification> findByIdAndUserId(Long id, String userId);
    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @org.springframework.data.jpa.repository.Query("update Notification n set n.read = true, n.updatedAt = :now where n.userId = :userId and n.read = false")
    int markAllRead(String userId, java.time.Instant now);
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Query("update Notification n set n.status = :status, n.attemptCount = :attempts, n.lastError = :error, n.sentAt = :sentAt, n.updatedAt = :now where n.id = :id")
    int updateDelivery(Long id, Notification.Status status, int attempts, String error, java.time.Instant sentAt, java.time.Instant now);
}
