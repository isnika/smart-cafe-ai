package com.smart_cafe_ai.inventory_service.dto.purchaseorder;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PurchaseOrderRequest {

    @NotNull(message = "Branch ID không được để trống")
    private Integer branchId;

    @NotNull(message = "Supplier ID không được để trống")
    private Integer supplierId;

    private com.smart_cafe_ai.inventory_service.enums.PurchaseOrderStatus status;

    private List<PurchaseOrderDetailRequest> details;

    @Valid
    private List<PurchaseOrderDetailRequest> items;

    public List<PurchaseOrderDetailRequest> getDetails() {
        return details != null ? details : items;
    }
}
