package com.smart_cafe_ai.store_service.dto.branch;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class BranchRequest {

    @NotBlank(message = "Mã chi nhánh không được trống")
    @Size(max = 20)
    private String code;

    @NotBlank(message = "Tên chi nhánh không được trống")
    @Size(max = 100)
    private String name;

    @NotBlank(message = "Địa chỉ không được trống")
    @Size(max = 255)
    private String address;

    @Size(max = 20)
    private String phone;

    private String timezone;

    @JsonProperty("opening_time")
    private String openingTime;  // "HH:mm:ss"

    @JsonProperty("closing_time")
    private String closingTime;  // "HH:mm:ss"

    @JsonProperty("accepts_online_orders")
    private Boolean acceptsOnlineOrders;

    @JsonProperty("delivery_radius_km")
    private BigDecimal deliveryRadiusKm;

    @JsonProperty("delivery_fee")
    private BigDecimal deliveryFee;
}
