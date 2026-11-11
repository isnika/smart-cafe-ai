package com.smart_cafe_ai.store_service.dto.shift;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.store_service.entity.Shift;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ShiftResponse {

    private Integer id;

    @JsonProperty("branch_id")
    private Integer branchId;

    private String name;

    @JsonProperty("start_time")
    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime startTime;

    @JsonProperty("end_time")
    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime endTime;

    @JsonProperty("is_overnight")
    private Boolean isOvernight;

    @JsonProperty("is_active")
    private Boolean isActive;

    public static ShiftResponse fromEntity(Shift shift) {
        LocalTime start = shift.getStartTime() != null ? shift.getStartTime().toLocalTime() : null;
        LocalTime end = shift.getEndTime() != null ? shift.getEndTime().toLocalTime() : null;
        boolean overnight = shift.getIsOvernight() != null ? shift.getIsOvernight() : (start != null && end != null && end.isBefore(start));

        return ShiftResponse.builder()
                .id(shift.getId())
                .branchId(shift.getBranch() != null ? shift.getBranch().getId() : null)
                .name(shift.getName())
                .startTime(start)
                .endTime(end)
                .isOvernight(overnight)
                .isActive(shift.getIsActive())
                .build();
    }
}
