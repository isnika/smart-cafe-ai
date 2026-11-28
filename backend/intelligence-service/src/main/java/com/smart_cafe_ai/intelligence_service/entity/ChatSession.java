package com.smart_cafe_ai.intelligence_service.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

@Entity
@Table(name = "Chat_Sessions")
@Getter
@Setter
@NoArgsConstructor
public class ChatSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", length = 36)
    private String userId;

    @Column(name = "guest_key", length = 64)
    private String guestKey;

    @Column(name = "staff_user_id", length = 36)
    private String staffUserId;

    @Column(name = "branch_id")
    private Integer branchId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ChatSessionStatus status = ChatSessionStatus.Active;

    @Column(name = "handed_off_at")
    private LocalDateTime handedOffAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    public ChatSession(String userId, String guestKey, Integer branchId) {
        this.userId = userId;
        this.guestKey = guestKey;
        this.branchId = branchId;
        this.status = ChatSessionStatus.Active;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now(ZoneOffset.UTC).withNano(0);
        }
        if (status == null) {
            status = ChatSessionStatus.Active;
        }
    }
}
