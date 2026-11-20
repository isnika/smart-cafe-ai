package com.smart_cafe_ai.intelligence_service.service;

import com.smart_cafe_ai.intelligence_service.client.AiServiceClient;
import com.smart_cafe_ai.intelligence_service.dto.chat.ChatRequest;
import com.smart_cafe_ai.intelligence_service.dto.chat.ChatResponse;
import com.smart_cafe_ai.intelligence_service.dto.chat.ReindexResponse;
import com.smart_cafe_ai.intelligence_service.dto.forecasting.ForecastingDto.*;
import com.smart_cafe_ai.intelligence_service.dto.recommendation.RecommendationRequest;
import com.smart_cafe_ai.intelligence_service.dto.recommendation.RecommendationResponse;
import com.smart_cafe_ai.intelligence_service.security.JwtService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class IntelligenceService {

    private final AiServiceClient aiServiceClient;
    private final JwtService jwtService;

    /**
     * 1. Gửi tin nhắn chat tới AI.
     * Bảo mật user_id: Nếu có token, trích xuất userId từ token để gắn ngữ cảnh,
     * tuyệt đối không tin tưởng client truyền bừa user_id.
     */
    public ChatResponse chat(ChatRequest request, String authorization, Integer branchId) {
        return aiServiceClient.chat(request, authorization, branchId);
    }

    /**
     * 2. Reindex knowledge base
     */
    public ReindexResponse reindex(String key) {
        return aiServiceClient.reindex(key);
    }

    /**
     * 3. Lấy đề xuất món ăn
     * Bảo mật user_id: Nếu người dùng yêu cầu personalized / reorder,
     * ghi đè user_id bằng subject trích xuất từ JWT token.
     */
    public RecommendationResponse getRecommendations(RecommendationRequest request, String authorization, Integer branchId) {
        if (authorization != null && authorization.startsWith("Bearer ")) {
            String token = authorization.substring(7);
            String verifiedUserId = jwtService.extractUserId(token);
            if (verifiedUserId != null) {
                request.setUserId(verifiedUserId);
            }
        }
        return aiServiceClient.recommend(request, authorization, branchId);
    }

    /**
     * 4. Dự báo doanh thu
     */
    public RevenueForecastResponse forecastRevenue(RevenueForecastRequest request, String authorization) {
        return aiServiceClient.forecastRevenue(request, authorization);
    }

    /**
     * 5. Dự báo nhu cầu sản phẩm
     */
    public ProductForecastResponse forecastProducts(TargetDateRequest request, String authorization) {
        return aiServiceClient.forecastProducts(request, authorization);
    }

    /**
     * 6. Dự báo tiêu hao nguyên liệu
     */
    public InventoryForecastResponse forecastInventory(TargetDateRequest request, String authorization) {
        return aiServiceClient.forecastInventory(request, authorization);
    }
}
