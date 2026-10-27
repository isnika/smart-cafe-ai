package com.smart_cafe_ai.inventory_service.entity;

import com.smart_cafe_ai.inventory_service.enums.SupplierStatus;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "Suppliers")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Supplier {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "phone", length = 20)
    private String phone;

    @Column(name = "email", length = 100)
    private String email;

    @Column(name = "tax_code", length = 20)
    private String taxCode;

    @Column(name = "address", length = 255)
    private String address;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private SupplierStatus status = SupplierStatus.Active;
}
