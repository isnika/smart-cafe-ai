package com.smart_cafe_ai.identity_service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AddressRequest {
    private String label;
    @JsonProperty("receiver_name")
    private String receiverName;
    private String phone;
    private String province;
    private String district;
    private String ward;
    @JsonProperty("address_line")
    private String addressLine;
    private BigDecimal latitude;
    private BigDecimal longitude;
    @JsonProperty("is_default")
    @Builder.Default
    private Boolean isDefault = false;
}
