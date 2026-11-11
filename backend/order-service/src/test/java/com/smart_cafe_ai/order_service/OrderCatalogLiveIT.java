package com.smart_cafe_ai.order_service;

import com.smart_cafe_ai.order_service.dto.Requests.Item;
import com.smart_cafe_ai.order_service.exception.ApiException;
import com.smart_cafe_ai.order_service.integration.HttpOrderDependencies;
import com.smart_cafe_ai.order_service.integration.OrderDependencies;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import javax.sql.DataSource;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/** Opt-in: real MySQL, real Store and Catalog processes, production Order HTTP adapter. No test profile. */
@EnabledIfEnvironmentVariable(named = "RUN_LIVE_ORDER_CATALOG", matches = "true")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = {
        "spring.jpa.hibernate.ddl-auto=none", "eureka.client.enabled=false", "spring.cloud.discovery.enabled=false",
        "app.order.expiry-enabled=false", "app.order-events.publisher-enabled=false", "app.engagement.recovery-enabled=false",
        "app.order-events.consumer-enabled=false", "app.identity-events.consumer-enabled=false",
        "spring.rabbitmq.dynamic=false", "spring.jpa.show-sql=false"})
class OrderCatalogLiveIT {
    @Autowired OrderDependencies dependencies;
    @Autowired DataSource dataSource;

    @Test void realServicesRejectANonexistentBranchWithoutFallingBackToSampleData() throws Exception {
        assertInstanceOf(HttpOrderDependencies.class, dependencies);
        try (var connection = dataSource.getConnection()) {
            assertTrue(connection.getMetaData().getURL().startsWith("jdbc:mysql:"));
        }
        var store = assertThrows(ApiException.class, () -> dependencies.branch(Integer.MAX_VALUE));
        assertEquals(404, store.status.value());
        var catalog = assertThrows(ApiException.class, () -> dependencies.resolve(Integer.MAX_VALUE,
                List.of(new Item(1, 1, null, List.of()))));
        assertEquals(404, catalog.status.value());
    }

    @Test void resolveExistingProductUsingRealBranchAndVariant() {
        String branch = System.getenv("LIVE_BRANCH_ID"), variant = System.getenv("LIVE_VARIANT_ID");
        assumeTrue(branch != null && variant != null,
                "Cần LIVE_BRANCH_ID và LIVE_VARIANT_ID trỏ dữ liệu thật hiện có; không tự tạo dữ liệu mẫu.");
        var store = dependencies.branch(Integer.valueOf(branch));
        var items = dependencies.resolve(store.id(), List.of(new Item(Integer.valueOf(variant), 1, null, List.of())));
        assertEquals(1, items.size());
        assertEquals(Integer.valueOf(variant), items.get(0).variantId());
        assertNotNull(items.get(0).productName());
        assertNotNull(items.get(0).price());
    }
}
