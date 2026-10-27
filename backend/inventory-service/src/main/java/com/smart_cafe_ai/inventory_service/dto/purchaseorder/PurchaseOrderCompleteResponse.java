package com.smart_cafe_ai.inventory_service.dto.purchaseorder;

import com.smart_cafe_ai.inventory_service.enums.PurchaseOrderStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PurchaseOrderCompleteResponse {
    private Long id;
    private Integer branchId;
    private Integer supplierId;
    private String supplierName;
    private BigDecimal totalAmount;
    private PurchaseOrderStatus status;
    private List<UpdatedIngredientInfo> updatedIngredients;
}
