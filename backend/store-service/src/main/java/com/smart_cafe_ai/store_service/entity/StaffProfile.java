package com.smart_cafe_ai.store_service.entity;

import com.smart_cafe_ai.store_service.enums.StaffEmploymentType;
import com.smart_cafe_ai.store_service.enums.StaffStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Thực thể hồ sơ nhân viên (Workforce capability).
 *
 * user_id: External reference tới smart_cafe_identity_db.Users.id.
 * Xác thực và phân quyền vẫn thuộc Identity Service;
 * StaffProfile chỉ lưu thông tin nhân sự (ca, chi nhánh, trạng thái).
 *
 * APP RULE: khi status = Terminated, phát sự kiện store.staff.terminated
 * để Identity Service set Users.status = 'Deactivated'.
 */
@Entity
@Table(
    name = "Staff_Profiles",
    uniqueConstraints = {
        @UniqueConstraint(name = "uq_staff_profile_user",    columnNames = {"user_id"}),
        @UniqueConstraint(name = "uq_staff_employee_code",   columnNames = {"employee_code"})
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StaffProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * External reference tới Identity Users.id (mỗi user chỉ có 1 staff profile).
     */
    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "branch_id", nullable = false, foreignKey = @ForeignKey(name = "fk_staff_profiles_branch"))
    private Branch branch;

    @Column(name = "employee_code", nullable = false, length = 30)
    private String employeeCode;

    @Column(name = "job_title", nullable = false, length = 100)
    private String jobTitle;

    @Enumerated(EnumType.STRING)
    @Column(name = "employment_type", nullable = false, length = 20)
    @Builder.Default
    private StaffEmploymentType employmentType = StaffEmploymentType.Full_Time;

    @Column(name = "hire_date", nullable = false)
    private LocalDate hireDate;

    @Column(name = "termination_date")
    private LocalDate terminationDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private StaffStatus status = StaffStatus.Active;

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
