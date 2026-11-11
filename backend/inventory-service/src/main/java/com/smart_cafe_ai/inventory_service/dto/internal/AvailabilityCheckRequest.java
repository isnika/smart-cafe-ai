package com.smart_cafe_ai.inventory_service.dto.internal;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AvailabilityCheckRequest {

    @NotNull(message = "Branch ID không được để trống")
    @JsonProperty("branch_id")
    private Integer branchId;

    @NotEmpty(message = "Danh sách items không được để trống")
    @Valid
    private List<AvailabilityCheckItem> items;
}
