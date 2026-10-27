package com.smart_cafe_ai.inventory_service.dto.purchaseorder;

import jakarta.validation.Valid;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PurchaseOrderReceiptRequest {

    @Valid
    private List<PurchaseOrderReceiptItemRequest> items;

    @Valid
    private List<PurchaseOrderReceiptItemRequest> receipts;

    public List<PurchaseOrderReceiptItemRequest> getItems() {
        return items != null && !items.isEmpty() ? items : receipts;
    }
}
