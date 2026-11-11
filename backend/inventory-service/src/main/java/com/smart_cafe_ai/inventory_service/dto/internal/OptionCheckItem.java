package com.smart_cafe_ai.inventory_service.dto.internal;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OptionCheckItem {

    @JsonProperty("option_id")
    private Integer optionId;

    @Builder.Default
    private Integer quantity = 1;
}
