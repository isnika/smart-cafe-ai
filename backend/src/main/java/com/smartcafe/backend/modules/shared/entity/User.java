package com.smartcafe.backend.modules.shared.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

// Entity dùng chung cho cả 2 module (BE1 + BE2)
// LƯU Ý: ai cần thêm/sửa field trong này phải báo trước cho người kia để tránh conflict
@Entity
@Table(name = "users")
@Getter
@Setter
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String password;

    private String fullName;

    private String phone;

    @Enumerated(EnumType.STRING)
    private Role role; // ADMIN, STAFF, CUSTOMER

    public enum Role {
        ADMIN, STAFF, CUSTOMER
    }
}
