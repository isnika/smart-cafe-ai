package com.smart_cafe_ai.inventory_service.dto.event;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OrderItemEvent {

    @JsonProperty("variant_id")
    private Integer variantId;

    private Integer quantity;
}
