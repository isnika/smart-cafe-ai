package com.smart_cafe_ai.inventory_service.dto.supplier;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SupplierRequest {

    @NotBlank(message = "Tên nhà cung cấp không được để trống")
    @Size(max = 100, message = "Tên tối đa 100 ký tự")
    private String name;

    @Size(max = 20, message = "Số điện thoại tối đa 20 ký tự")
    private String phone;

    @Size(max = 100, message = "Email tối đa 100 ký tự")
    private String email;

    @Size(max = 20, message = "Mã số thuế tối đa 20 ký tự")
    private String taxCode;

    @Size(max = 255, message = "Địa chỉ tối đa 255 ký tự")
    private String address;

    private com.smart_cafe_ai.inventory_service.enums.SupplierStatus status;
}
