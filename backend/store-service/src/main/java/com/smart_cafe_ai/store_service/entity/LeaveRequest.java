package com.smart_cafe_ai.store_service.entity;

import com.smart_cafe_ai.store_service.enums.LeaveStatus;
import com.smart_cafe_ai.store_service.enums.LeaveType;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Thực thể đơn xin nghỉ phép của nhân viên.
 *
 * APP RULE (BR-WF-03): Khi được duyệt (Approved), service phải
 * tự động chuyển các Schedule trong khoảng nghỉ sang status = 'Leave'
 * trong cùng một transaction.
 *
 * Ràng buộc:
 * - approver_staff_id ≠ staff_id (không tự duyệt) – kiểm tra ở app layer.
 * - reviewed_at phải có giá trị khi status IN (Approved, Rejected).
 */
@Entity
@Table(name = "Leave_Requests")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LeaveRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "staff_id", nullable = false, foreignKey = @ForeignKey(name = "fk_leave_staff"))
    private StaffProfile staff;

    @Enumerated(EnumType.STRING)
    @Column(name = "leave_type", nullable = false, length = 20)
    @Builder.Default
    private LeaveType leaveType = LeaveType.Annual;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(name = "reason", nullable = false, columnDefinition = "TEXT")
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private LeaveStatus status = LeaveStatus.Pending;

    /**
     * Quản lý (staff profile) phê duyệt/từ chối đơn.
     * NULL khi đơn còn Pending hoặc bị Cancelled.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "approver_staff_id", foreignKey = @ForeignKey(name = "fk_leave_approver_staff"))
    private StaffProfile approverStaff;

    @Column(name = "reviewed_at")
    private LocalDateTime reviewedAt;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    private void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
