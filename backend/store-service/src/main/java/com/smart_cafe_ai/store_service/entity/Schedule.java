package com.smart_cafe_ai.store_service.entity;

import com.smart_cafe_ai.store_service.enums.ScheduleStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * Thực thể lịch làm việc – phân công nhân viên vào ca cụ thể mỗi ngày.
 *
 * Ràng buộc quan trọng:
 * - uq_staff_work_date: một nhân viên chỉ có một ca mỗi ngày.
 * - Composite FK (staff_id, branch_id) đảm bảo ca và nhân viên cùng chi nhánh.
 * - Composite FK (shift_id, branch_id) đảm bảo ca và khung giờ cùng chi nhánh.
 *
 * JPA không hỗ trợ composite FK trực tiếp trong @JoinColumn đa cột với
 * bảng trung gian; các ràng buộc này được đảm bảo ở DB và application layer.
 */
@Entity
@Table(
    name = "Schedules",
    uniqueConstraints = {
        @UniqueConstraint(name = "uq_staff_work_date", columnNames = {"staff_id", "work_date"})
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Schedule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * branch_id lưu riêng để thực thi composite FK ở DB layer.
     * Đọc từ staffProfile.branch khi cần, nhưng cột này phải khớp với shift.branch.
     */
    @Column(name = "branch_id", nullable = false)
    private Integer branchId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "staff_id", nullable = false, foreignKey = @ForeignKey(name = "fk_schedules_staff"))
    private StaffProfile staff;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "shift_id", nullable = false, foreignKey = @ForeignKey(name = "fk_schedules_shift"))
    private Shift shift;

    @Column(name = "work_date", nullable = false)
    private LocalDate workDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private ScheduleStatus status = ScheduleStatus.Scheduled;
}
