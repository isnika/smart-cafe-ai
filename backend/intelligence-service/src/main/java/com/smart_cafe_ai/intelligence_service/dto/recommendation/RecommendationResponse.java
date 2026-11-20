package com.smart_cafe_ai.intelligence_service.dto.recommendation;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RecommendationResponse {
    @JsonProperty("user_id")
    private String userId;

    @JsonProperty("product_id")
    private Integer productId;

    @JsonProperty("branch_id")
    private Integer branchId;

    private String strategy;

    @JsonProperty("fallback_reason")
    private String fallbackReason;

    private Boolean discovery;

    @JsonProperty("model_version")
    private String modelVersion;

    private List<RecommendationItem> recommendations;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RecommendationItem {
        @JsonProperty("product_id")
        private Integer productId;

        private String name;
        private String category;

        @JsonProperty("price_vnd")
        private Long priceVnd;

        private String image;
        private Double score;

        @JsonProperty("reason_code")
        private String reasonCode;

        private String reason;
        private String strategy;

        @JsonProperty("recommendation_type")
        private String recommendationType;
    }
}
