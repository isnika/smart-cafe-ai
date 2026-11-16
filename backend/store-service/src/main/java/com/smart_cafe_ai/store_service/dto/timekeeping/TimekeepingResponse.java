package com.smart_cafe_ai.store_service.dto.timekeeping;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.store_service.dto.schedule.ScheduleResponse;
import com.smart_cafe_ai.store_service.dto.staff.StaffProfileResponse;
import com.smart_cafe_ai.store_service.entity.Timekeeping;
import com.smart_cafe_ai.store_service.enums.TimekeepingSource;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TimekeepingResponse {

    private Long id;

    @JsonProperty("schedule_id")
    private Long scheduleId;

    @JsonProperty("check_in")
    private LocalDateTime checkIn;

    @JsonProperty("check_out")
    private LocalDateTime checkOut;

    private TimekeepingSource source;

    @JsonProperty("is_adjusted")
    private Boolean isAdjusted;

    @JsonProperty("adjusted_by_staff_id")
    private Long adjustedByStaffId;

    @JsonProperty("adjustment_reason")
    private String adjustmentReason;

    private ScheduleResponse schedule;

    private StaffProfileResponse staff;

    public static TimekeepingResponse fromEntity(Timekeeping t) {
        ScheduleResponse scheduleRes = t.getSchedule() != null ? ScheduleResponse.fromEntity(t.getSchedule()) : null;
        StaffProfileResponse staffRes = (t.getSchedule() != null && t.getSchedule().getStaff() != null)
                ? StaffProfileResponse.fromEntity(t.getSchedule().getStaff())
                : null;

        return TimekeepingResponse.builder()
                .id(t.getId())
                .scheduleId(t.getSchedule() != null ? t.getSchedule().getId() : null)
                .checkIn(t.getCheckIn())
                .checkOut(t.getCheckOut())
                .source(t.getSource())
                .isAdjusted(t.getIsAdjusted())
                .adjustedByStaffId(t.getAdjustedByStaff() != null ? t.getAdjustedByStaff().getId() : null)
                .adjustmentReason(t.getAdjustmentReason())
                .schedule(scheduleRes)
                .staff(staffRes)
                .build();
    }
}
