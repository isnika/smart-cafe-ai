package com.smart_cafe_ai.inventory_service.dto.event;

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
public class OrderEventPayload {

    @JsonProperty("event_id")
    private String eventId;

    @JsonProperty("order_id")
    private Long orderId;

    @JsonProperty("branch_id")
    private Integer branchId;

    private List<OrderItemEvent> items;
}
