package com.smart_cafe_ai.store_service.dto.branch;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.store_service.entity.Branch;
import com.smart_cafe_ai.store_service.enums.BranchStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BranchResponse {

    private Integer id;
    private String code;
    private String name;
    private String address;
    private String phone;
    private String timezone;

    @JsonProperty("opening_time")
    private String openingTime;

    @JsonProperty("closing_time")
    private String closingTime;

    @JsonProperty("accepts_online_orders")
    private Boolean acceptsOnlineOrders;

    @JsonProperty("delivery_radius_km")
    private BigDecimal deliveryRadiusKm;

    @JsonProperty("delivery_fee")
    private BigDecimal deliveryFee;

    private BranchStatus status;

    public static BranchResponse fromEntity(Branch b) {
        return BranchResponse.builder()
                .id(b.getId())
                .code(b.getCode())
                .name(b.getName())
                .address(b.getAddress())
                .phone(b.getPhone())
                .timezone(b.getTimezone())
                .openingTime(b.getOpeningTime() != null ? b.getOpeningTime().toString() : null)
                .closingTime(b.getClosingTime() != null ? b.getClosingTime().toString() : null)
                .acceptsOnlineOrders(b.getAcceptsOnlineOrders())
                .deliveryRadiusKm(b.getDeliveryRadiusKm())
                .deliveryFee(b.getDeliveryFee())
                .status(b.getStatus())
                .build();
    }
}
