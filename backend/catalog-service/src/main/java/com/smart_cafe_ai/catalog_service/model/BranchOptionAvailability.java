package com.smart_cafe_ai.catalog_service.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "Branch_Option_Availability",uniqueConstraints=@UniqueConstraint(name="uq_branch_option_availability",columnNames={"branch_id","option_id"}))
@Getter
@NoArgsConstructor
public class BranchOptionAvailability {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "branch_id", nullable = false)
    private Integer branchId;
    @Column(name = "option_id", nullable = false)
    private Integer optionId;
    @ManyToOne(fetch=FetchType.LAZY)
    @JoinColumn(name="option_id",insertable=false,updatable=false,foreignKey=@ForeignKey(name="fk_branch_option_availability_option"))
    private ProductOption option;
    @Column(name = "is_available", nullable = false)
    private boolean available;
    @Column(name = "unavailable_reason")
    private String unavailableReason;
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    public BranchOptionAvailability(Integer branchId, Integer optionId) { this.branchId=branchId; this.optionId=optionId; }
    public void change(boolean available, String reason) {
        this.available=available; this.unavailableReason=available?null:reason;
        this.updatedAt=LocalDateTime.now(java.time.ZoneOffset.UTC).withNano(0);
    }
}

