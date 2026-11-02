package com.smart_cafe_ai.store_service.entity;

import com.smart_cafe_ai.store_service.enums.TimekeepingSource;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Thực thể chấm công – ghi nhận check-in/check-out thực tế của nhân viên.
 *
 * Mỗi ca làm việc (Schedule) chỉ có DUY NHẤT một bản ghi Timekeeping.
 *
 * is_adjusted: nếu TRUE, bắt buộc phải có adjusted_by_staff và adjustment_reason
 * (ràng buộc được kiểm tra ở application layer – khớp với chk_timekeeping_adjust trong DB).
 */
@Entity
@Table(name = "Timekeeping")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Timekeeping {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * OneToOne – mỗi schedule chỉ có 1 bản ghi chấm công.
     */
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "schedule_id", nullable = false, unique = true,
                foreignKey = @ForeignKey(name = "fk_timekeeping_schedule"))
    private Schedule schedule;

    @Column(name = "check_in")
    private LocalDateTime checkIn;

    @Column(name = "check_out")
    private LocalDateTime checkOut;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 20)
    @Builder.Default
    private TimekeepingSource source = TimekeepingSource.Manual;

    @Column(name = "is_adjusted", nullable = false)
    @Builder.Default
    private Boolean isAdjusted = false;

    /**
     * External reference tới Staff_Profiles.id – người duyệt điều chỉnh.
     * Bắt buộc khi is_adjusted = true.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "adjusted_by_staff_id",
                foreignKey = @ForeignKey(name = "fk_timekeeping_adjuster"))
    private StaffProfile adjustedByStaff;

    @Column(name = "adjustment_reason", length = 255)
    private String adjustmentReason;
}
