package com.smart_cafe_ai.store_service.dto.staff;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.store_service.enums.StaffEmploymentType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StaffProfileUpdateRequest {

    @NotBlank(message = "Chức danh không được trống")
    @JsonProperty("job_title")
    private String jobTitle;

    @NotNull(message = "Loại hình làm việc không được trống")
    @JsonProperty("employment_type")
    private StaffEmploymentType employmentType;

    @NotNull(message = "Ngày vào làm không được trống")
    @JsonProperty("hire_date")
    private LocalDate hireDate;
}
