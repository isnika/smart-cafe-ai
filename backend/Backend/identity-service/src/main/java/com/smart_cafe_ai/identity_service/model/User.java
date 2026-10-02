package com.smart_cafe_ai.identity_service.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "Users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @Column(length = 36)
    private String id;

    @Column(unique = true, length = 100)
    private String email;

    @Column(unique = true, length = 20)
    private String phone;

    @Column(name = "password_hash", length = 255)
    private String passwordHash;

    @Column(name = "google_id", unique = true, length = 100)
    private String googleId;

    @Column(name = "full_name", nullable = false, length = 100)
    private String fullName;

    @Column(length = 255)
    private String avatar;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "role_id", nullable = false)
    private Role role;

    @Column(name = "branch_id")
    private Integer branchId;

    @Enumerated(EnumType.STRING)
    @Column(columnDefinition = "ENUM('Active', 'Banned', 'Unverified') DEFAULT 'Unverified'")
    private UserStatus status;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    public void ensureIdAndStatus() {
        if (this.id == null || this.id.isBlank()) {
            this.id = java.util.UUID.randomUUID().toString();
        }
        if (this.status == null) {
            this.status = UserStatus.Unverified;
        }
    }
}
