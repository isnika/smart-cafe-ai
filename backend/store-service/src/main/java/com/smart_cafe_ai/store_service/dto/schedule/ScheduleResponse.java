package com.smart_cafe_ai.store_service.dto.schedule;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.store_service.dto.shift.ShiftResponse;
import com.smart_cafe_ai.store_service.dto.staff.StaffProfileResponse;
import com.smart_cafe_ai.store_service.entity.Schedule;
import com.smart_cafe_ai.store_service.enums.ScheduleStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ScheduleResponse {

    private Long id;

    @JsonProperty("branch_id")
    private Integer branchId;

    @JsonProperty("staff_id")
    private Long staffId;

    @JsonProperty("shift_id")
    private Integer shiftId;

    @JsonProperty("work_date")
    private LocalDate workDate;

    private ScheduleStatus status;

    private StaffProfileResponse staff;

    private ShiftResponse shift;

    public static ScheduleResponse fromEntity(Schedule schedule) {
        StaffProfileResponse staffRes = schedule.getStaff() != null ? StaffProfileResponse.fromEntity(schedule.getStaff()) : null;
        ShiftResponse shiftRes = schedule.getShift() != null ? ShiftResponse.fromEntity(schedule.getShift()) : null;

        return ScheduleResponse.builder()
                .id(schedule.getId())
                .branchId(schedule.getBranchId())
                .staffId(schedule.getStaff() != null ? schedule.getStaff().getId() : null)
                .shiftId(schedule.getShift() != null ? schedule.getShift().getId() : null)
                .workDate(schedule.getWorkDate())
                .status(schedule.getStatus())
                .staff(staffRes)
                .shift(shiftRes)
                .build();
    }
}
