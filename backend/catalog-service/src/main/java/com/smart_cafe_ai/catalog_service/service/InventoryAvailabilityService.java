package com.smart_cafe_ai.catalog_service.service;

import com.smart_cafe_ai.catalog_service.model.*;
import com.smart_cafe_ai.catalog_service.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.util.*;

@Service @RequiredArgsConstructor
public class InventoryAvailabilityService {
    public static final String LOW_STOCK="inventory.ingredient.low_stock";
    public static final String RESTOCKED="inventory.ingredient.restocked";
    public record Event(String id,String type,Integer branchId,List<Integer> variantIds) {}
    private final ProcessedEventRepository processed;
    private final ProductRepository products;
    private final ProductVariantRepository variants;
    private final BranchProductAvailabilityRepository branchVariants;

    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void process(Event event) {
        if(event==null || event.id()==null || event.id().length()!=36 || event.branchId()==null || event.branchId()<=0 ||
                (!LOW_STOCK.equals(event.type()) && !RESTOCKED.equals(event.type()))) throw new IllegalArgumentException("Invalid inventory event");
        UUID.fromString(event.id());
        if(processed.existsById(event.id())) return;
        // Restocking one ingredient does not prove all recipe ingredients are available.
        // Keep the event unprocessed for retry/DLQ until backend 2 supplies an authoritative contract.
        if(RESTOCKED.equals(event.type())) throw new IllegalStateException(
                "Chưa có hợp đồng xác nhận đủ toàn bộ nguyên liệu từ Inventory; không tự bật lại biến thể.");
        // Claim and availability changes commit atomically; a duplicate concurrent delivery rolls back.
        processed.saveAndFlush(new ProcessedEvent(event.id(),event.type()));
        boolean available=false;
        String reason="Nguyên liệu chưa đủ theo thông báo từ Inventory.";
        // Lock each aggregate in a fixed order, then reload after the lock. External IDs never create phantom rows.
        SortedSet<Integer> productIds=new TreeSet<>();
        for(Integer id:event.variantIds()) variants.productIdOf(id).ifPresent(productIds::add);
        for(Integer id:productIds) products.findByIdForUpdate(id);
        for(var variant:variants.findByIdIn(event.variantIds())) {
            var row=branchVariants.findByBranchIdAndVariantId(event.branchId(),variant.getId())
                    .orElseGet(()->new BranchProductAvailability(event.branchId(),variant.getId()));
            row.change(available,reason);branchVariants.save(row);
        }
    }
}
