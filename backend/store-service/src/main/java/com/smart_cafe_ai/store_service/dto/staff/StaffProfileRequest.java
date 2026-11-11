package com.smart_cafe_ai.store_service.dto.staff;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.store_service.enums.StaffEmploymentType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
public class StaffProfileRequest {

    @NotBlank(message = "user_id không được trống")
    @JsonProperty("user_id")
    private String userId;

    @NotNull(message = "branch_id không được trống")
    @JsonProperty("branch_id")
    private Integer branchId;

    @NotBlank(message = "Mã nhân viên không được trống")
    @JsonProperty("employee_code")
    private String employeeCode;

    @NotBlank(message = "Chức danh không được trống")
    @JsonProperty("job_title")
    private String jobTitle;

    @JsonProperty("employment_type")
    private StaffEmploymentType employmentType;

    @NotNull(message = "Ngày vào làm không được trống")
    @JsonProperty("hire_date")
    private LocalDate hireDate;
}
