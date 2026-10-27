package com.smart_cafe_ai.inventory_service.dto.supplier;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SupplierResponse {
    private Integer id;
    private String name;
    private String phone;
    private String email;
    private String taxCode;
    private String address;
    private com.smart_cafe_ai.inventory_service.enums.SupplierStatus status;
}
