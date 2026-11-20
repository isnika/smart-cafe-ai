package com.smart_cafe_ai.intelligence_service.dto.recommendation;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RecommendationRequest {
    @JsonProperty("user_id")
    private String userId;

    @JsonProperty("product_id")
    private Integer productId;

    private String mode; // "personalized", "similar", "trending", "reorder"

    private Boolean discovery;

    @JsonProperty("top_k")
    private Integer topK;
}
