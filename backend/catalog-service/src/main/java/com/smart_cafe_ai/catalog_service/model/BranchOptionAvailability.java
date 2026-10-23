package com.smart_cafe_ai.catalog_service.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "Branch_Option_Availability")
@Getter
@NoArgsConstructor
public class BranchOptionAvailability {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "branch_id", nullable = false)
    private Integer branchId;
    @Column(name = "option_id", nullable = false)
    private Integer optionId;
    @Column(name = "is_available", nullable = false)
    private boolean available;
    @Column(name = "unavailable_reason")
    private String unavailableReason;
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}

