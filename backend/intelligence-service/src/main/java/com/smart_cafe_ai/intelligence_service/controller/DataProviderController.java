package com.smart_cafe_ai.intelligence_service.controller;

import com.smart_cafe_ai.intelligence_service.dto.data.DataApiDto.*;
import com.smart_cafe_ai.intelligence_service.service.DataProviderService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
@Tag(name = "AI Data Callback Endpoints", description = "Endpoints cung cấp dữ liệu nghiệp vụ cho FastAPI AI Service gọi ngược về")
public class DataProviderController {

    private final DataProviderService dataProviderService;

    /**
     * 1. GET /api/ai/catalog/search?q=...&intent=...&branch_id=...
     */
    @Operation(summary = "1. AI Callback: Tìm kiếm thực đơn / availability")
    @GetMapping("/catalog/search")
    public ResponseEntity<CatalogSearchResponse> searchCatalog(
            @RequestParam(value = "q", required = false) String query,
            @RequestParam(value = "intent", required = false) String intent,
            @RequestParam(value = "branch_id", required = false) Integer branchId
    ) {
        return ResponseEntity.ok(dataProviderService.searchCatalog(query, intent, branchId));
    }

    /**
     * 2. GET /api/ai/orders/{order_code}
     */
    @Operation(summary = "2. AI Callback: Tra cứu trạng thái đơn hàng (Bảo mật theo Authorization)")
    @GetMapping("/orders/{orderCode}")
    public ResponseEntity<OrderLookupResponse> lookupOrder(
            @PathVariable("orderCode") String orderCode,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization
    ) {
        return ResponseEntity.ok(dataProviderService.lookupOrder(orderCode, authorization));
    }

    /**
     * 3. GET /api/ai/recommendation/viewer
     */
    @Operation(summary = "3. AI Callback: Xác định user_id người xem từ JWT Token")
    @GetMapping("/recommendation/viewer")
    public ResponseEntity<ViewerResponse> getViewer(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization
    ) {
        return ResponseEntity.ok(dataProviderService.getViewer(authorization));
    }

    /**
     * 4. GET /api/ai/recommendation/snapshot?branch_id=...
     */
    @Operation(summary = "4. AI Callback: Lấy snapshot thực đơn và tương tác (không PII)")
    @GetMapping("/recommendation/snapshot")
    public ResponseEntity<RecommendationSnapshot> getRecommendationSnapshot(
            @RequestParam(value = "branch_id", required = false) Integer branchId
    ) {
        return ResponseEntity.ok(dataProviderService.getRecommendationSnapshot(branchId));
    }

    /**
     * 5. GET /api/ai/forecasting/snapshot?branch_id=...
     */
    @Operation(summary = "5. AI Callback: Lấy snapshot lịch sử đơn hàng, công thức và tồn kho")
    @GetMapping("/forecasting/snapshot")
    public ResponseEntity<ForecastingSnapshot> getForecastingSnapshot(
            @RequestParam(value = "branch_id", required = false) Integer branchId
    ) {
        return ResponseEntity.ok(dataProviderService.getForecastingSnapshot(branchId));
    }
}
