package com.smart_cafe_ai.intelligence_service.service;

import com.smart_cafe_ai.intelligence_service.client.AiServiceClient;
import com.smart_cafe_ai.intelligence_service.dto.chat.ChatMessageDto;
import com.smart_cafe_ai.intelligence_service.dto.chat.ChatReply;
import com.smart_cafe_ai.intelligence_service.dto.chat.ChatSessionDto;
import com.smart_cafe_ai.intelligence_service.dto.chat.ChatRequest;
import com.smart_cafe_ai.intelligence_service.dto.chat.CreateChatSessionRequest;
import com.smart_cafe_ai.intelligence_service.dto.chat.SendChatMessageRequest;
import com.smart_cafe_ai.intelligence_service.entity.ChatMessage;
import com.smart_cafe_ai.intelligence_service.entity.ChatSenderRole;
import com.smart_cafe_ai.intelligence_service.entity.ChatSession;
import com.smart_cafe_ai.intelligence_service.entity.ChatSessionStatus;
import com.smart_cafe_ai.intelligence_service.repository.ChatMessageRepository;
import com.smart_cafe_ai.intelligence_service.repository.ChatSessionRepository;
import com.smart_cafe_ai.intelligence_service.security.JwtService;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class ChatSessionService {

    private static final int MAX_HISTORY_MESSAGES = 30;
    private static final String CLIENT_MESSAGE_ID = "client_message_id";

    private final ChatSessionRepository sessionRepository;
    private final ChatMessageRepository messageRepository;
    private final AiServiceClient aiServiceClient;
    private final JwtService jwtService;

    @Transactional
    public ChatSessionDto create(CreateChatSessionRequest request, String authorization, Integer branchId) {
        ChatActor actor = resolveActor(authorization, request.getGuestKey());
        Integer requestedBranch = request.getBranchId() != null ? request.getBranchId() : branchId;

        if (request.getSessionId() != null) {
            return ChatSessionDto.from(requireOwned(request.getSessionId(), actor));
        }

        if (!request.isNewSession()) {
            ChatSession existing = findLatestOpen(actor, requestedBranch);
            if (existing != null) {
                return ChatSessionDto.from(existing);
            }
        }

        ChatSession session = new ChatSession(actor.userId(), actor.guestKey(), requestedBranch);
        return ChatSessionDto.from(sessionRepository.save(session));
    }

    @Transactional
    public List<ChatMessageDto> messages(Long sessionId, String authorization, String guestKey) {
        ChatActor actor = resolveActor(authorization, guestKey);
        ChatSession session = requireOwned(sessionId, actor);
        return messageRepository.findAllBySessionIdOrderByCreatedAtAscIdAsc(session.getId()).stream()
                .map(ChatMessageDto::from)
                .toList();
    }

    @Transactional
    public ChatReply send(Long sessionId, SendChatMessageRequest request, String authorization, String guestKey,
                          Integer branchId) {
        ChatActor actor = resolveActor(authorization, guestKey);
        ChatSession session = requireOwned(sessionId, actor, true);
        String content = request.getContent() == null ? "" : request.getContent().trim();
        if (content.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nội dung tin nhắn không được để trống");
        }
        if (content.length() > 1000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tin nhắn tối đa 1000 ký tự");
        }
        if (session.getStatus() == ChatSessionStatus.Closed) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Phiên chat đã đóng");
        }

        List<ChatMessage> existingMessages = messageRepository
                .findAllBySessionIdOrderByCreatedAtAscIdAsc(session.getId());
        String clientMessageId = normalizeClientMessageId(request.getClientMessageId());
        ChatMessage existing = findByClientMessageId(existingMessages, clientMessageId);
        if (existing != null) {
            if (!Objects.equals(existing.getContent(), content)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "clientMessageId đã được dùng cho nội dung khác");
            }
            return completeExistingMessage(session, existing, existingMessages, actor, authorization, branchId);
        }

        Map<String, Object> customerMetadata = clientMessageId == null
                ? null
                : Map.of(CLIENT_MESSAGE_ID, clientMessageId);
        ChatMessage customerMessage = messageRepository.saveAndFlush(
                new ChatMessage(session, ChatSenderRole.Customer, actor.userId(), content, customerMetadata)
        );
        existingMessages.add(customerMessage);

        ChatMessage assistantMessage = generateAssistantMessage(
                session, customerMessage, existingMessages, actor, authorization, branchId
        );

        List<ChatMessageDto> replyMessages = assistantMessage == null
                ? List.of(ChatMessageDto.from(customerMessage))
                : List.of(ChatMessageDto.from(customerMessage), ChatMessageDto.from(assistantMessage));
        return ChatReply.builder()
                .messages(replyMessages)
                .session(ChatSessionDto.from(session))
                .build();
    }

    private ChatReply completeExistingMessage(ChatSession session, ChatMessage customerMessage,
                                              List<ChatMessage> messages, ChatActor actor,
                                              String authorization, Integer branchId) {
        ChatMessage assistant = messageRepository
                .findFirstBySessionIdAndIdGreaterThanOrderByIdAsc(session.getId(), customerMessage.getId());
        if (assistant != null && assistant.getSenderRole() != ChatSenderRole.AI) {
            assistant = null;
        }
        if (assistant == null) {
            assistant = generateAssistantMessage(session, customerMessage, messages, actor, authorization, branchId);
        }
        List<ChatMessageDto> replyMessages = assistant == null
                ? List.of(ChatMessageDto.from(customerMessage))
                : List.of(ChatMessageDto.from(customerMessage), ChatMessageDto.from(assistant));
        return ChatReply.builder()
                .messages(replyMessages)
                .session(ChatSessionDto.from(session))
                .build();
    }

    private ChatMessage generateAssistantMessage(ChatSession session, ChatMessage currentMessage,
                                                 List<ChatMessage> messages, ChatActor actor,
                                                 String authorization, Integer branchId) {
        if (session.getStatus() != ChatSessionStatus.Active) {
            return null;
        }

        List<ChatMessage> beforeCurrent = messages.stream()
                .filter(message -> message.getId() < currentMessage.getId())
                .toList();
        List<ChatMessage> historyMessages = beforeCurrent.stream()
                .filter(message -> message.getSenderRole() == ChatSenderRole.Customer
                        || message.getSenderRole() == ChatSenderRole.AI)
                .toList();
        int historyStart = Math.max(0, historyMessages.size() - MAX_HISTORY_MESSAGES);
        List<ChatRequest.ChatMessageItem> history = historyMessages.subList(historyStart, historyMessages.size()).stream()
                .map(message -> ChatRequest.ChatMessageItem.builder()
                        .role(message.getSenderRole() == ChatSenderRole.Customer ? "user" : "assistant")
                        .content(message.getContent())
                        .build())
                .toList();

        ChatRequest aiRequest = ChatRequest.builder()
                .userId(actor.userId())
                .message(currentMessage.getContent())
                .history(new ArrayList<>(history))
                .build();
        var aiResponse = aiServiceClient.chat(aiRequest, authorization, session.getBranchId() != null
                ? session.getBranchId()
                : branchId);

        Map<String, Object> metadata = new LinkedHashMap<>();
        if (aiResponse != null && aiResponse.getSources() != null && !aiResponse.getSources().isEmpty()) {
            metadata.put("sources", aiResponse.getSources());
        }
        String answer = aiResponse == null ? null : aiResponse.getAnswer();
        if (answer == null || answer.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "AI không trả về câu trả lời hợp lệ");
        }
        return messageRepository.saveAndFlush(
                new ChatMessage(session, ChatSenderRole.AI, null, answer.trim(),
                        metadata.isEmpty() ? null : Collections.unmodifiableMap(metadata))
        );
    }

    private ChatSession findLatestOpen(ChatActor actor, Integer branchId) {
        List<ChatSession> sessions = actor.userId() != null
                ? sessionRepository.findAllByUserIdOrderByCreatedAtDesc(actor.userId())
                : sessionRepository.findAllByUserIdIsNullAndGuestKeyOrderByCreatedAtDesc(actor.guestKey());
        return sessions.stream()
                .filter(session -> session.getStatus() != ChatSessionStatus.Closed)
                .filter(session -> branchId == null || Objects.equals(branchId, session.getBranchId()))
                .findFirst()
                .orElse(null);
    }

    private ChatSession requireOwned(Long sessionId, ChatActor actor) {
        return requireOwned(sessionId, actor, false);
    }

    private ChatSession requireOwned(Long sessionId, ChatActor actor, boolean lock) {
        ChatSession session = (lock ? sessionRepository.findByIdForUpdate(sessionId) : sessionRepository.findById(sessionId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy phiên chat"));
        boolean owned = actor.userId() != null
                ? actor.userId().equals(session.getUserId())
                : session.getUserId() == null && actor.guestKey().equals(session.getGuestKey());
        // 404 avoids revealing that another user's session exists.
        if (!owned) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy phiên chat");
        }
        return session;
    }

    private ChatActor resolveActor(String authorization, String guestKey) {
        if (authorization != null && !authorization.isBlank()) {
            if (!authorization.startsWith("Bearer ")) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authorization không hợp lệ");
            }
            String token = authorization.substring(7).trim();
            if (token.isBlank() || !jwtService.isTokenValid(token)) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Token không hợp lệ hoặc đã hết hạn");
            }
            String userId = jwtService.extractUserId(token);
            if (userId == null || userId.isBlank()) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Token không có danh tính người dùng");
            }
            return new ChatActor(userId, null);
        }

        String normalizedGuestKey = guestKey == null ? "" : guestKey.trim();
        if (normalizedGuestKey.isBlank() || normalizedGuestKey.length() > 64) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Cần guestKey cho phiên chat khách vãng lai");
        }
        return new ChatActor(null, normalizedGuestKey);
    }

    private String normalizeClientMessageId(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isBlank() ? null : normalized;
    }

    private ChatMessage findByClientMessageId(List<ChatMessage> messages, String clientMessageId) {
        if (clientMessageId == null) {
            return null;
        }
        return messages.stream()
                .filter(message -> message.getSenderRole() == ChatSenderRole.Customer)
                .filter(message -> message.getMetadata() != null
                        && clientMessageId.equals(message.getMetadata().get(CLIENT_MESSAGE_ID)))
                .findFirst()
                .orElse(null);
    }

    private record ChatActor(String userId, String guestKey) {
    }
}
