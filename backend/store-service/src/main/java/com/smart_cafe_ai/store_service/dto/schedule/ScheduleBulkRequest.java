package com.smart_cafe_ai.store_service.dto.schedule;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ScheduleBulkRequest {

    @NotEmpty(message = "Danh sách phân ca items không được để trống")
    @Valid
    private List<ScheduleRequest> items;
}
