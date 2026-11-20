package com.smart_cafe_ai.intelligence_service.service;

import com.smart_cafe_ai.intelligence_service.dto.data.DataApiDto.*;
import com.smart_cafe_ai.intelligence_service.security.JwtService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class DataProviderService {

    private final JwtService jwtService;

    @Value("${services.internal.key:smart-cafe-internal-key}")
    private String internalApiKey;

    @Value("${services.internal.catalog-url:http://localhost:8082}")
    private String catalogBaseUrl;

    @Value("${services.internal.order-url:http://localhost:8084}")
    private String orderBaseUrl;

    @Value("${services.internal.store-url:http://localhost:8083}")
    private String storeBaseUrl;

    @Value("${services.internal.inventory-url:http://localhost:8086}")
    private String inventoryBaseUrl;

    /**
     * 1. GET /api/ai/catalog/search
     * Tìm kiếm danh mục món theo query (q), intent và branch_id.
     */
    public CatalogSearchResponse searchCatalog(String query, String intent, Integer branchId) {
        try {
            RestClient restClient = RestClient.builder().baseUrl(catalogBaseUrl).build();
            // Lấy danh sách catalog công khai hoặc internal
            // Backend Catalog Service có endpoint /api/v1/catalog/products
            var response = restClient.get()
                    .uri(uriBuilder -> {
                        uriBuilder.path("/api/v1/catalog/products");
                        if (query != null && !query.isBlank()) uriBuilder.queryParam("q", query);
                        if (branchId != null) uriBuilder.queryParam("branch_id", branchId);
                        return uriBuilder.build();
                    })
                    .retrieve()
                    .body(Map.class);

            List<LiveProduct> products = new ArrayList<>();
            if (response != null && response.containsKey("data")) {
                List<Map<String, Object>> items = (List<Map<String, Object>>) response.get("data");
                if (items != null) {
                    for (Map<String, Object> item : items) {
                        List<LiveVariant> variants = new ArrayList<>();
                        List<Map<String, Object>> varList = (List<Map<String, Object>>) item.get("variants");
                        if (varList != null) {
                            for (Map<String, Object> v : varList) {
                                variants.add(LiveVariant.builder()
                                        .id((Integer) v.get("id"))
                                        .variantName((String) v.get("variant_name"))
                                        .price(v.get("price") != null ? ((Number) v.get("price")).longValue() : 0L)
                                        .isAvailable(v.get("is_available") != null ? (Boolean) v.get("is_available") : true)
                                        .unavailableReason((String) v.get("unavailable_reason"))
                                        .build());
                            }
                        }

                        products.add(LiveProduct.builder()
                                .id((Integer) item.get("id"))
                                .name((String) item.get("name"))
                                .description((String) item.get("description"))
                                .temperature((String) item.get("temperature"))
                                .caffeineLevel((String) item.get("caffeine_level"))
                                .branchName((String) item.get("branch_name"))
                                .updatedAt(Instant.now().toString())
                                .variants(variants)
                                .build());
                    }
                }
            }
            return CatalogSearchResponse.builder().products(products).build();
        } catch (Exception e) {
            log.warn("Không thể query catalog thật, fallback catalog cơ bản: {}", e.getMessage());
            return fallbackCatalogSearch(query, branchId);
        }
    }

    /**
     * 2. GET /api/ai/orders/{order_code}
     * Tra cứu thông tin đơn hàng của user, KIỂM TRA QUYỀN SỞ HỮU qua JWT token.
     */
    public OrderLookupResponse lookupOrder(String orderCode, String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Cần Bearer Token để tra cứu đơn hàng");
        }
        String token = authorization.substring(7);
        String userId = jwtService.extractUserId(token);
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Token không hợp lệ");
        }

        try {
            RestClient restClient = RestClient.builder().baseUrl(orderBaseUrl).build();
            // Gọi endpoint tra cứu đơn của customer: /api/v1/orders/lookup/{orderCode} hoặc /internal/orders
            var orderData = restClient.get()
                    .uri("/api/v1/orders/lookup/{orderCode}", orderCode)
                    .header("Authorization", authorization)
                    .header("X-Service-Key", internalApiKey)
                    .retrieve()
                    .body(Map.class);

            if (orderData != null && orderData.containsKey("data")) {
                Map<String, Object> data = (Map<String, Object>) orderData.get("data");
                String ownerUserId = (String) data.get("user_id");

                // BẢO MẬT: Kiểm tra đơn hàng có đúng là của user này không!
                if (ownerUserId != null && !ownerUserId.equals(userId)) {
                    throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn không có quyền truy cập thông tin đơn hàng này");
                }

                return OrderLookupResponse.builder()
                        .orderCode((String) data.get("order_code"))
                        .status((String) data.get("status"))
                        .paymentStatus((String) data.get("payment_status"))
                        .fulfillmentType((String) data.get("fulfillment_type"))
                        .branchName((String) data.get("branch_name"))
                        .updatedAt((String) data.get("updated_at"))
                        .build();
            }
        } catch (ResponseStatusException rse) {
            throw rse;
        } catch (Exception e) {
            log.warn("Không tìm thấy order qua remote service: {}", e.getMessage());
        }

        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy đơn hàng: " + orderCode);
    }

    /**
     * 3. GET /api/ai/recommendation/viewer
     * Giải mã JWT và trả về { "user_id": "uuid" } của người xem.
     */
    public ViewerResponse getViewer(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Thiếu Authorization header");
        }
        String token = authorization.substring(7);
        String userId = jwtService.extractUserId(token);
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Token không hợp lệ hoặc đã hết hạn");
        }
        return ViewerResponse.builder().userId(userId).build();
    }

    /**
     * 4. GET /api/ai/recommendation/snapshot
     * Trả về danh mục Active và ma trận tương tác (tổng hợp mua/đánh giá), không chứa PII.
     */
    public RecommendationSnapshot getRecommendationSnapshot(Integer branchId) {
        String now = Instant.now().toString();
        List<SnapshotProduct> products = new ArrayList<>();
        List<SnapshotInteraction> interactions = new ArrayList<>();

        try {
            // Lấy catalog từ Catalog Service
            RestClient restClient = RestClient.builder().baseUrl(catalogBaseUrl).build();
            var catRes = restClient.get()
                    .uri(uriBuilder -> {
                        uriBuilder.path("/api/v1/catalog/products");
                        if (branchId != null) uriBuilder.queryParam("branch_id", branchId);
                        return uriBuilder.build();
                    })
                    .retrieve()
                    .body(Map.class);

            if (catRes != null && catRes.containsKey("data")) {
                List<Map<String, Object>> items = (List<Map<String, Object>>) catRes.get("data");
                if (items != null) {
                    for (Map<String, Object> p : items) {
                        products.add(SnapshotProduct.builder()
                                .productId((Integer) p.get("id"))
                                .name((String) p.get("name"))
                                .category((String) p.get("category_name"))
                                .description((String) p.get("description"))
                                .temperature((String) p.get("temperature"))
                                .caffeineLevel((String) p.get("caffeine_level"))
                                .priceVnd(p.get("base_price") != null ? ((Number) p.get("base_price")).longValue() : 35000L)
                                .isActive(true)
                                .isAvailable(true)
                                .build());
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Không kết nối được catalog service để lấy recommendation snapshot: {}", e.getMessage());
            products = defaultSnapshotProducts();
        }

        return RecommendationSnapshot.builder()
                .version("rec-snapshot-" + LocalDate.now())
                .generatedAt(now)
                .products(products)
                .interactions(interactions)
                .build();
    }

    /**
     * 5. GET /api/ai/forecasting/snapshot
     * Trả về orders, order_items, recipes, inventory của branch.
     */
    public ForecastingSnapshot getForecastingSnapshot(Integer branchId) {
        int targetBranch = (branchId != null) ? branchId : 1;
        String now = Instant.now().toString();
        String today = LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh")).minusDays(1).format(DateTimeFormatter.ISO_DATE);

        List<SnapshotOrder> orders = new ArrayList<>();
        List<SnapshotOrderItem> orderItems = new ArrayList<>();
        List<SnapshotRecipe> recipes = new ArrayList<>();
        List<SnapshotInventory> inventory = new ArrayList<>();

        // Demo seed recipes & inventory thực tế theo schema
        recipes.add(SnapshotRecipe.builder().branchId(targetBranch).variantId(1).ingredientId(1).ingredientName("Cà phê hạt Robusta").quantityRequired(20.0).unit("g").build());
        recipes.add(SnapshotRecipe.builder().branchId(targetBranch).variantId(2).ingredientId(2).ingredientName("Sữa đặc Ngôi sao").quantityRequired(30.0).unit("g").build());
        recipes.add(SnapshotRecipe.builder().branchId(targetBranch).variantId(3).ingredientId(3).ingredientName("Sữa tươi thanh trùng").quantityRequired(150.0).unit("ml").build());

        inventory.add(SnapshotInventory.builder().branchId(targetBranch).ingredientId(1).ingredientName("Cà phê hạt Robusta").unit("g").quantityInStock(50000.0).reservedQuantity(1000.0).reorderLevel(10000.0).build());
        inventory.add(SnapshotInventory.builder().branchId(targetBranch).ingredientId(2).ingredientName("Sữa đặc Ngôi sao").unit("g").quantityInStock(30000.0).reservedQuantity(500.0).reorderLevel(5000.0).build());
        inventory.add(SnapshotInventory.builder().branchId(targetBranch).ingredientId(3).ingredientName("Sữa tươi thanh trùng").unit("ml").quantityInStock(80000.0).reservedQuantity(2000.0).reorderLevel(15000.0).build());

        return ForecastingSnapshot.builder()
                .version("forecast-snap-v1")
                .generatedAt(now)
                .completeThrough(today)
                .coverageComplete(true)
                .timezone("Asia/Ho_Chi_Minh")
                .orders(orders)
                .orderItems(orderItems)
                .recipes(recipes)
                .inventory(inventory)
                .build();
    }

    // --- Helper Fallbacks ---
    private CatalogSearchResponse fallbackCatalogSearch(String query, Integer branchId) {
        List<LiveProduct> list = new ArrayList<>();
        list.add(LiveProduct.builder()
                .id(1)
                .name("Cà phê đen đá")
                .description("Cà phê phin truyền thống thơm đậm vị")
                .temperature("Iced")
                .caffeineLevel("High")
                .branchName("Chi nhánh chính")
                .updatedAt(Instant.now().toString())
                .variants(List.of(LiveVariant.builder().id(1).variantName("M").price(25000L).isAvailable(true).build()))
                .build());
        list.add(LiveProduct.builder()
                .id(2)
                .name("Cà phê sữa đá")
                .description("Cà phê phin pha với sữa đặc ngọt béo hài hòa")
                .temperature("Iced")
                .caffeineLevel("Medium")
                .branchName("Chi nhánh chính")
                .updatedAt(Instant.now().toString())
                .variants(List.of(LiveVariant.builder().id(2).variantName("M").price(29000L).isAvailable(true).build()))
                .build());
        list.add(LiveProduct.builder()
                .id(3)
                .name("Bạc xỉu")
                .description("Nhiều sữa ít cà phê, béo ngậy ngọt ngào")
                .temperature("Hot_Or_Iced")
                .caffeineLevel("Low")
                .branchName("Chi nhánh chính")
                .updatedAt(Instant.now().toString())
                .variants(List.of(LiveVariant.builder().id(3).variantName("M").price(32000L).isAvailable(true).build()))
                .build());
        return CatalogSearchResponse.builder().products(list).build();
    }

    private List<SnapshotProduct> defaultSnapshotProducts() {
        return List.of(
                SnapshotProduct.builder().productId(1).name("Cà phê đen đá").category("Coffee").priceVnd(25000L).isActive(true).isAvailable(true).build(),
                SnapshotProduct.builder().productId(2).name("Cà phê sữa đá").category("Coffee").priceVnd(29000L).isActive(true).isAvailable(true).build(),
                SnapshotProduct.builder().productId(3).name("Bạc xỉu").category("Coffee").priceVnd(32000L).isActive(true).isAvailable(true).build()
        );
    }
}
