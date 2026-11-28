package com.smart_cafe_ai.intelligence_service.repository;

import com.smart_cafe_ai.intelligence_service.entity.ChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {
    List<ChatMessage> findAllBySessionIdOrderByCreatedAtAscIdAsc(Long sessionId);

    ChatMessage findFirstBySessionIdAndIdGreaterThanOrderByIdAsc(Long sessionId, Long messageId);
}
