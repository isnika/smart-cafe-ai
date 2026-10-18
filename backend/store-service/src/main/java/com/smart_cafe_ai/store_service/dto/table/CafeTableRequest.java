package com.smart_cafe_ai.store_service.dto.table;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CafeTableRequest {

    @JsonProperty("branch_id")
    private Integer branchId;

    @NotBlank(message = "Số bàn không được trống")
    @Size(max = 20)
    @JsonProperty("table_number")
    private String tableNumber;
}
