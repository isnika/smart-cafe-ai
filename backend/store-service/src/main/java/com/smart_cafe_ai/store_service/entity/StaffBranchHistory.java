package com.smart_cafe_ai.store_service.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Lịch sử chuyển chi nhánh của nhân viên.
 * Ghi lại mỗi lần nhân viên được điều chuyển sang chi nhánh mới.
 */
@Entity
@Table(name = "Staff_Branch_History")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StaffBranchHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "staff_id", nullable = false, foreignKey = @ForeignKey(name = "fk_staff_history_staff"))
    private StaffProfile staff;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "from_branch_id", foreignKey = @ForeignKey(name = "fk_staff_history_from"))
    private Branch fromBranch;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "to_branch_id", nullable = false, foreignKey = @ForeignKey(name = "fk_staff_history_to"))
    private Branch toBranch;

    @Column(name = "effective_date", nullable = false)
    private LocalDate effectiveDate;

    /**
     * External reference tới Identity Users.id – người thực hiện điều chuyển.
     */
    @Column(name = "changed_by", length = 36)
    private String changedBy;

    @Column(name = "note", length = 255)
    private String note;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
