package com.smart_cafe_ai.intelligence_service.dto.chat;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatRequest {
    /** Chỉ do backend suy ra từ JWT; không tin giá trị do browser gửi lên. */
    @JsonProperty("user_id")
    private String userId;
    private String message;
    @Builder.Default
    private List<ChatMessageItem> history = new ArrayList<>();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ChatMessageItem {
        private String role; // "user" hoặc "assistant"
        private String content;
    }
}
