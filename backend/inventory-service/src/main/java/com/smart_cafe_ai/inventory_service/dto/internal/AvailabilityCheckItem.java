package com.smart_cafe_ai.inventory_service.dto.internal;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AvailabilityCheckItem {

    @JsonProperty("variant_id")
    private Integer variantId;

    private Integer quantity;

    private List<OptionCheckItem> options;
}
