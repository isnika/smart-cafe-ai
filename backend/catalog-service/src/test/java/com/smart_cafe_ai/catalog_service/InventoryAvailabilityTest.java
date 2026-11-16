package com.smart_cafe_ai.catalog_service;
import com.smart_cafe_ai.catalog_service.model.*;
import com.smart_cafe_ai.catalog_service.repository.*;
import com.smart_cafe_ai.catalog_service.service.InventoryAvailabilityService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest @ActiveProfiles("test") @Transactional @Sql("/catalog-fixture.sql")
class InventoryAvailabilityTest {
    @Autowired InventoryAvailabilityService service;
    @Autowired ProcessedEventRepository processed;
    @Autowired BranchProductAvailabilityRepository variants;
    @Autowired ProductVariantRepository productVariants;
    @Test void lowStockUpdatesOnlyBranchOverridesAndIsIdempotent() {
        var event=new InventoryAvailabilityService.Event(UUID.randomUUID().toString(),InventoryAvailabilityService.LOW_STOCK,30,List.of(11));
        service.process(event);service.process(event);
        assertEquals(1,processed.count());assertFalse(variants.findByBranchIdAndVariantId(30,11).orElseThrow().isAvailable());
        assertEquals(MenuStatus.Active,productVariants.findById(11).orElseThrow().getStatus());
        assertFalse(variants.findByBranchIdAndVariantId(10,11).orElseThrow().isAvailable());
    }
    @Test void restockNeverAssumesAllIngredientsAreAvailable() {
        String id=UUID.randomUUID().toString();
        assertThrows(IllegalStateException.class,()->service.process(new InventoryAvailabilityService.Event(
                id,InventoryAvailabilityService.RESTOCKED,10,List.of(11))));
        assertFalse(processed.existsById(id));
        assertFalse(variants.findByBranchIdAndVariantId(10,11).orElseThrow().isAvailable());
    }
    @Test void unknownExternalReferencesDoNotCreatePhantomCatalogRows() {
        service.process(new InventoryAvailabilityService.Event(UUID.randomUUID().toString(),InventoryAvailabilityService.LOW_STOCK,30,List.of(999999)));
        assertTrue(variants.findByBranchIdAndVariantId(30,999999).isEmpty());assertEquals(1,processed.count());
    }
}
