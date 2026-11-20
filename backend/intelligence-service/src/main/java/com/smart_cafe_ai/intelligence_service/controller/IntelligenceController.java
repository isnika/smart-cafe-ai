package com.smart_cafe_ai.intelligence_service.controller;

import com.smart_cafe_ai.intelligence_service.dto.chat.ChatRequest;
import com.smart_cafe_ai.intelligence_service.dto.chat.ChatResponse;
import com.smart_cafe_ai.intelligence_service.dto.chat.ReindexResponse;
import com.smart_cafe_ai.intelligence_service.dto.forecasting.ForecastingDto.*;
import com.smart_cafe_ai.intelligence_service.dto.recommendation.RecommendationRequest;
import com.smart_cafe_ai.intelligence_service.dto.recommendation.RecommendationResponse;
import com.smart_cafe_ai.intelligence_service.service.IntelligenceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping
@RequiredArgsConstructor
@Tag(name = "AI Gateway Integration", description = "6 API Spring Boot gọi sang FastAPI AI Service")
public class IntelligenceController {

    private final IntelligenceService intelligenceService;

    /**
     * 1. POST /chat hoặc /api/v1/chat
     */
    @Operation(summary = "1. Trò chuyện với trợ lý ảo Smart Cafe AI")
    @PostMapping({"/chat", "/api/v1/chat"})
    public ResponseEntity<ChatResponse> chat(
            @RequestBody ChatRequest request,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestHeader(value = "X-Branch-Id", required = false) Integer branchId
    ) {
        return ResponseEntity.ok(intelligenceService.chat(request, authorization, branchId));
    }

    /**
     * 2. POST /chat/reindex hoặc /api/v1/chat/reindex
     */
    @Operation(summary = "2. Yêu cầu AI nạp & reindex lại Knowledge Base")
    @PostMapping({"/chat/reindex", "/api/v1/chat/reindex"})
    public ResponseEntity<ReindexResponse> reindex(
            @RequestHeader(value = "X-Reindex-Key", required = false) String key
    ) {
        return ResponseEntity.ok(intelligenceService.reindex(key));
    }

    /**
     * 3. POST /api/recommendation hoặc /api/v1/ai/recommendation
     */
    @Operation(summary = "3. Lấy đề xuất món ăn thông minh (Personalized / Similar / Trending / Reorder)")
    @PostMapping({"/api/recommendation", "/api/v1/ai/recommendation"})
    public ResponseEntity<RecommendationResponse> recommend(
            @RequestBody RecommendationRequest request,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestHeader(value = "X-Branch-Id", required = false) Integer branchId
    ) {
        return ResponseEntity.ok(intelligenceService.getRecommendations(request, authorization, branchId));
    }

    /**
     * 4. POST /api/forecasting hoặc /api/v1/ai/forecasting
     */
    @Operation(summary = "4. Dự báo doanh thu theo chi nhánh")
    @PostMapping({"/api/forecasting", "/api/v1/ai/forecasting"})
    public ResponseEntity<RevenueForecastResponse> forecastRevenue(
            @RequestBody RevenueForecastRequest request,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization
    ) {
        return ResponseEntity.ok(intelligenceService.forecastRevenue(request, authorization));
    }

    /**
     * 5. POST /api/forecasting/products hoặc /api/v1/ai/forecasting/products
     */
    @Operation(summary = "5. Dự báo nhu cầu số lượng món và biến thể")
    @PostMapping({"/api/forecasting/products", "/api/v1/ai/forecasting/products"})
    public ResponseEntity<ProductForecastResponse> forecastProducts(
            @RequestBody TargetDateRequest request,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization
    ) {
        return ResponseEntity.ok(intelligenceService.forecastProducts(request, authorization));
    }

    /**
     * 6. POST /api/forecasting/inventory hoặc /api/v1/ai/forecasting/inventory
     */
    @Operation(summary = "6. Dự báo tiêu hao nguyên liệu & đề xuất nhập hàng")
    @PostMapping({"/api/forecasting/inventory", "/api/v1/ai/forecasting/inventory"})
    public ResponseEntity<InventoryForecastResponse> forecastInventory(
            @RequestBody TargetDateRequest request,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization
    ) {
        return ResponseEntity.ok(intelligenceService.forecastInventory(request, authorization));
    }
}
