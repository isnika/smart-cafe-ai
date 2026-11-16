package com.smart_cafe_ai.store_service.dto.leaverequest;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.store_service.dto.staff.StaffProfileResponse;
import com.smart_cafe_ai.store_service.entity.LeaveRequest;
import com.smart_cafe_ai.store_service.enums.LeaveStatus;
import com.smart_cafe_ai.store_service.enums.LeaveType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LeaveRequestResponse {

    private Long id;

    @JsonProperty("staff_id")
    private Long staffId;

    @JsonProperty("employee_code")
    private String employeeCode;

    @JsonProperty("leave_type")
    private LeaveType leaveType;

    @JsonProperty("start_date")
    private LocalDate startDate;

    @JsonProperty("end_date")
    private LocalDate endDate;

    private String reason;

    private LeaveStatus status;

    @JsonProperty("approver_staff_id")
    private Long approverStaffId;

    @JsonProperty("reviewed_at")
    private LocalDateTime reviewedAt;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;

    private StaffProfileResponse staff;

    public static LeaveRequestResponse fromEntity(LeaveRequest lr) {
        StaffProfileResponse staffRes = lr.getStaff() != null ? StaffProfileResponse.fromEntity(lr.getStaff()) : null;

        return LeaveRequestResponse.builder()
                .id(lr.getId())
                .staffId(lr.getStaff() != null ? lr.getStaff().getId() : null)
                .employeeCode(lr.getStaff() != null ? lr.getStaff().getEmployeeCode() : null)
                .leaveType(lr.getLeaveType())
                .startDate(lr.getStartDate())
                .endDate(lr.getEndDate())
                .reason(lr.getReason())
                .status(lr.getStatus())
                .approverStaffId(lr.getApproverStaff() != null ? lr.getApproverStaff().getId() : null)
                .reviewedAt(lr.getReviewedAt())
                .createdAt(lr.getCreatedAt())
                .updatedAt(lr.getUpdatedAt())
                .staff(staffRes)
                .build();
    }
}
