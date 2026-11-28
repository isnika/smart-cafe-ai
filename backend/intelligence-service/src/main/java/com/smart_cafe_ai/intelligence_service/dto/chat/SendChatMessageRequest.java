package com.smart_cafe_ai.intelligence_service.dto.chat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class SendChatMessageRequest {
    @NotBlank
    @Size(max = 1000)
    private String content;

    /** Id ổn định do client tạo để retry không tạo thêm tin nhắn. */
    @Size(max = 128)
    private String clientMessageId;
}
