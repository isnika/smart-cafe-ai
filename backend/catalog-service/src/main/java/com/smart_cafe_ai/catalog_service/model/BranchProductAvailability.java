package com.smart_cafe_ai.catalog_service.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "Branch_Product_Availability",uniqueConstraints=@UniqueConstraint(name="uq_branch_variant_availability",columnNames={"branch_id","variant_id"}))
@Getter
@NoArgsConstructor
public class BranchProductAvailability {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    // External Store reference: deliberately no JPA association or cross-service FK.
    @Column(name = "branch_id", nullable = false)
    private Integer branchId;
    @Column(name = "variant_id", nullable = false)
    private Integer variantId;
    @ManyToOne(fetch=FetchType.LAZY)
    @JoinColumn(name="variant_id",insertable=false,updatable=false,foreignKey=@ForeignKey(name="fk_branch_product_availability_variant"))
    private ProductVariant variant;
    @Column(name = "is_available", nullable = false)
    private boolean available;
    @Column(name = "unavailable_reason")
    private String unavailableReason;
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    public BranchProductAvailability(Integer branchId, Integer variantId) { this.branchId=branchId; this.variantId=variantId; }
    public void change(boolean available, String reason) {
        this.available=available; this.unavailableReason=available?null:reason;
        this.updatedAt=LocalDateTime.now(java.time.ZoneOffset.UTC).withNano(0);
    }
}

