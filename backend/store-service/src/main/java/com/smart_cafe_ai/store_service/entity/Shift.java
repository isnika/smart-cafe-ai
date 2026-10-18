package com.smart_cafe_ai.store_service.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * Thực thể khung ca làm việc.
 * Mỗi ca thuộc một chi nhánh và có khoảng giờ bắt đầu – kết thúc.
 *
 * is_overnight: STORED generated column trong DB (end_time < start_time).
 * Không cần lưu trong JPA – được tính bởi DB khi INSERT/UPDATE.
 */
@Entity
@Table(
    name = "Shifts",
    uniqueConstraints = {
        @UniqueConstraint(name = "uq_shift_per_branch", columnNames = {"branch_id", "name"})
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Shift {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "branch_id", nullable = false, foreignKey = @ForeignKey(name = "fk_shifts_branch"))
    private Branch branch;

    @Column(name = "name", nullable = false, length = 50)
    private String name;

    @Column(name = "start_time", nullable = false)
    private java.sql.Time startTime;

    @Column(name = "end_time", nullable = false)
    private java.sql.Time endTime;

    /**
     * is_overnight là STORED generated column ở DB.
     * Được đọc về (insertable=false, updatable=false) để sử dụng trong logic tính giờ.
     */
    @Column(name = "is_overnight", insertable = false, updatable = false)
    private Boolean isOvernight;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private Boolean isActive = true;
}
