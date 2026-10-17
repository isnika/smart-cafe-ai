package com.smart_cafe_ai.engagement_service.model;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.Instant;

@Entity
@Table(name = "Notifications", uniqueConstraints = @UniqueConstraint(
        name = "uk_notifications_event_id", columnNames = "event_id"))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Notification {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "event_id", nullable = false, length = 36)
    private String eventId;
    // Reference only: there is deliberately no JPA relation to Identity's Users table.
    @Column(name = "user_id", length = 36)
    private String userId;
    @Column(nullable = false, length = 50)
    private String type;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Channel channel;
    @Column(nullable = false, length = 150)
    private String title;
    @Column(nullable = false, length = 500)
    private String body;
    @Column(name = "is_read", nullable = false)
    private boolean read;
    @Column(nullable = false, length = 255)
    private String recipient;
    @Column(nullable = false, length = 40)
    private String purpose;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;
    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;
    @Column(name = "last_error", length = 255)
    private String lastError;
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    @Column(name = "sent_at")
    private Instant sentAt;

    public enum Status { PENDING, SENT, FAILED, EXPIRED }
    public enum Channel { Push, Email, SMS, In_App }

    public Notification(String eventId, String userId, String recipient, String purpose, Instant expiresAt) {
        this.eventId = eventId;
        this.userId = userId;
        this.type = "OTP";
        this.channel = Channel.Email;
        this.title = "Smart Cafe AI - Xác thực OTP";
        // Persist notification metadata only; the plaintext OTP is confined to email delivery.
        this.body = "Yêu cầu xác thực bằng mã OTP qua email.";
        this.recipient = recipient;
        this.purpose = purpose;
        this.expiresAt = expiresAt;
        this.status = Status.PENDING;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }

    @PreUpdate
    public void updateTimestamp() {
        updatedAt = Instant.now();
    }
}
