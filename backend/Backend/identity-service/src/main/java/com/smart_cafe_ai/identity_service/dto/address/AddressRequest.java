package com.smart_cafe_ai.identity_service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AddressRequest {
    @JsonProperty("receiver_name")
    private String receiverName;
    private String phone;
    private String province;
    private String district;
    private String ward;
    @JsonProperty("address_line")
    private String addressLine;
    @JsonProperty("is_default")
    @Builder.Default
    private Boolean isDefault = false;
}
