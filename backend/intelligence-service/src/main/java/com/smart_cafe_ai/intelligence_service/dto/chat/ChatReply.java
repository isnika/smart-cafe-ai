package com.smart_cafe_ai.intelligence_service.dto.chat;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
@AllArgsConstructor
public class ChatReply {
    private List<ChatMessageDto> messages;
    private ChatSessionDto session;
}
