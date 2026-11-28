package com.smart_cafe_ai.intelligence_service.dto.chat;

import com.smart_cafe_ai.intelligence_service.entity.ChatMessage;
import com.smart_cafe_ai.intelligence_service.entity.ChatSenderRole;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.Map;

@Data
@Builder
@AllArgsConstructor
public class ChatMessageDto {
    private Long id;
    private Long sessionId;
    private ChatSenderRole senderRole;
    private String senderUserId;
    private String content;
    private Map<String, Object> metadata;
    private LocalDateTime createdAt;

    public static ChatMessageDto from(ChatMessage message) {
        return ChatMessageDto.builder()
                .id(message.getId())
                .sessionId(message.getSession().getId())
                .senderRole(message.getSenderRole())
                .senderUserId(message.getSenderUserId())
                .content(message.getContent())
                .metadata(message.getMetadata())
                .createdAt(message.getCreatedAt())
                .build();
    }
}
