package com.smart_cafe_ai.store_service.dto.staff;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.store_service.dto.identity.UserInfo;
import com.smart_cafe_ai.store_service.entity.StaffProfile;
import com.smart_cafe_ai.store_service.enums.StaffEmploymentType;
import com.smart_cafe_ai.store_service.enums.StaffStatus;
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
public class StaffProfileResponse {

    private Long id;

    @JsonProperty("user_id")
    private String userId;

    @JsonProperty("branch_id")
    private Integer branchId;

    @JsonProperty("branch_name")
    private String branchName;

    @JsonProperty("employee_code")
    private String employeeCode;

    @JsonProperty("job_title")
    private String jobTitle;

    @JsonProperty("employment_type")
    private StaffEmploymentType employmentType;

    @JsonProperty("hire_date")
    private LocalDate hireDate;

    @JsonProperty("termination_date")
    private LocalDate terminationDate;

    private StaffStatus status;

    @JsonProperty("user_info")
    private UserInfo userInfo;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;

    public static StaffProfileResponse fromEntity(StaffProfile s) {
        return StaffProfileResponse.builder()
                .id(s.getId())
                .userId(s.getUserId())
                .branchId(s.getBranch() != null ? s.getBranch().getId() : null)
                .branchName(s.getBranch() != null ? s.getBranch().getName() : null)
                .employeeCode(s.getEmployeeCode())
                .jobTitle(s.getJobTitle())
                .employmentType(s.getEmploymentType())
                .hireDate(s.getHireDate())
                .terminationDate(s.getTerminationDate())
                .status(s.getStatus())
                .createdAt(s.getCreatedAt())
                .updatedAt(s.getUpdatedAt())
                .build();
    }
}
