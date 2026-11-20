package com.smart_cafe_ai.intelligence_service.client;

import com.smart_cafe_ai.intelligence_service.dto.chat.ChatRequest;
import com.smart_cafe_ai.intelligence_service.dto.chat.ChatResponse;
import com.smart_cafe_ai.intelligence_service.dto.chat.ReindexResponse;
import com.smart_cafe_ai.intelligence_service.dto.forecasting.ForecastingDto.*;
import com.smart_cafe_ai.intelligence_service.dto.recommendation.RecommendationRequest;
import com.smart_cafe_ai.intelligence_service.dto.recommendation.RecommendationResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
@Slf4j
public class AiServiceClient {

    private final RestClient restClient;
    private final String reindexKey;

    public AiServiceClient(
            @Value("${ai.service.base-url:http://localhost:8000}") String baseUrl,
            @Value("${ai.service.reindex-key:smart-cafe-reindex-secret}") String reindexKey
    ) {
        this.reindexKey = reindexKey;
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    /**
     * 1. POST /chat
     */
    public ChatResponse chat(ChatRequest request, String authorization, Integer branchId) {
        var spec = restClient.post()
                .uri("/chat")
                .body(request);
        if (authorization != null && !authorization.isBlank()) {
            spec.header(HttpHeaders.AUTHORIZATION, authorization);
        }
        if (branchId != null) {
            spec.header("X-Branch-Id", String.valueOf(branchId));
        }
        return spec.retrieve().body(ChatResponse.class);
    }

    /**
     * 2. POST /chat/reindex
     */
    public ReindexResponse reindex(String customKey) {
        String key = (customKey != null && !customKey.isBlank()) ? customKey : this.reindexKey;
        return restClient.post()
                .uri("/chat/reindex")
                .header("X-Reindex-Key", key)
                .retrieve()
                .body(ReindexResponse.class);
    }

    /**
     * 3. POST /api/recommendation
     */
    public RecommendationResponse recommend(RecommendationRequest request, String authorization, Integer branchId) {
        var spec = restClient.post()
                .uri("/api/recommendation")
                .body(request);
        if (authorization != null && !authorization.isBlank()) {
            spec.header(HttpHeaders.AUTHORIZATION, authorization);
        }
        if (branchId != null) {
            spec.header("X-Branch-Id", String.valueOf(branchId));
        }
        return spec.retrieve().body(RecommendationResponse.class);
    }

    /**
     * 4. POST /api/forecasting (Doanh thu)
     */
    public RevenueForecastResponse forecastRevenue(RevenueForecastRequest request, String authorization) {
        var spec = restClient.post()
                .uri("/api/forecasting")
                .body(request);
        if (authorization != null && !authorization.isBlank()) {
            spec.header(HttpHeaders.AUTHORIZATION, authorization);
        }
        return spec.retrieve().body(RevenueForecastResponse.class);
    }

    /**
     * 5. POST /api/forecasting/products (Nhu cầu món / biến thể)
     */
    public ProductForecastResponse forecastProducts(TargetDateRequest request, String authorization) {
        var spec = restClient.post()
                .uri("/api/forecasting/products")
                .body(request);
        if (authorization != null && !authorization.isBlank()) {
            spec.header(HttpHeaders.AUTHORIZATION, authorization);
        }
        return spec.retrieve().body(ProductForecastResponse.class);
    }

    /**
     * 6. POST /api/forecasting/inventory (Tiêu hao nguyên liệu / tồn kho)
     */
    public InventoryForecastResponse forecastInventory(TargetDateRequest request, String authorization) {
        var spec = restClient.post()
                .uri("/api/forecasting/inventory")
                .body(request);
        if (authorization != null && !authorization.isBlank()) {
            spec.header(HttpHeaders.AUTHORIZATION, authorization);
        }
        return spec.retrieve().body(InventoryForecastResponse.class);
    }
}
