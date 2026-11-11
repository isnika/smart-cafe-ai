package com.smart_cafe_ai.engagement_service.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.Map;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "Notifications", uniqueConstraints = @UniqueConstraint(
        name = "uk_notifications_event_id", columnNames = "event_id"))
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
    @Column(length = 255)
    private String recipient;
    @Column(length = 40)
    private String purpose;
    @Convert(converter = NotificationStatusConverter.class)
    @Column(nullable = false, length = 20)
    private Status status;
    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;
    @Column(name = "last_error", length = 255)
    private String lastError;
    @Column(name = "expires_at")
    private Instant expiresAt;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    @Column(name = "sent_at")
    private Instant sentAt;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "json")
    private Map<String, Object> data;

    public enum Status { PENDING, SENT, FAILED, EXPIRED }
    public enum Channel { Push, Email, SMS, In_App }

    protected Notification() { }
    public Long getId() { return id; }
    public void setId(Long value) { id=value; }
    public String getEventId() { return eventId; }
    public void setEventId(String value) { eventId=value; }
    public String getUserId() { return userId; }
    public void setUserId(String value) { userId=value; }
    public String getType() { return type; }
    public void setType(String value) { type=value; }
    public Channel getChannel() { return channel; }
    public void setChannel(Channel value) { channel=value; }
    public String getTitle() { return title; }
    public void setTitle(String value) { title=value; }
    public String getBody() { return body; }
    public void setBody(String value) { body=value; }
    public boolean isRead() { return read; }
    public void setRead(boolean value) { read=value; }
    public String getRecipient() { return recipient; }
    public void setRecipient(String value) { recipient=value; }
    public String getPurpose() { return purpose; }
    public void setPurpose(String value) { purpose=value; }
    public Status getStatus() { return status; }
    public void setStatus(Status value) { status=value; }
    public int getAttemptCount() { return attemptCount; }
    public void setAttemptCount(int value) { attemptCount=value; }
    public String getLastError() { return lastError; }
    public void setLastError(String value) { lastError=value; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant value) { expiresAt=value; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant value) { createdAt=value; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant value) { updatedAt=value; }
    public Instant getSentAt() { return sentAt; }
    public void setSentAt(Instant value) { sentAt=value; }
    public Map<String,Object> getData() { return data; }
    public void setData(Map<String,Object> value) { data=value; }

    public static Notification inApp(String userId, String type, String title, String body, Map<String, Object> data) {
        Notification n = new Notification();
        n.eventId = java.util.UUID.randomUUID().toString();
        n.userId = userId; n.type = type; n.title = title; n.body = body; n.data = data;
        n.channel = Channel.In_App; n.status = Status.SENT;
        n.createdAt = Instant.now(); n.updatedAt = n.createdAt; n.sentAt = n.createdAt;
        return n;
    }

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
