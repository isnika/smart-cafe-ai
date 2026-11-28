package com.smart_cafe_ai.intelligence_service.dto.chat;

import com.smart_cafe_ai.intelligence_service.entity.ChatSession;
import com.smart_cafe_ai.intelligence_service.entity.ChatSessionStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
@AllArgsConstructor
public class ChatSessionDto {
    private Long id;
    private String userId;
    private String guestKey;
    private String staffUserId;
    private Integer branchId;
    private ChatSessionStatus status;
    private LocalDateTime handedOffAt;
    private LocalDateTime createdAt;
    private LocalDateTime closedAt;

    public static ChatSessionDto from(ChatSession session) {
        return ChatSessionDto.builder()
                .id(session.getId())
                .userId(session.getUserId())
                .guestKey(session.getGuestKey())
                .staffUserId(session.getStaffUserId())
                .branchId(session.getBranchId())
                .status(session.getStatus())
                .handedOffAt(session.getHandedOffAt())
                .createdAt(session.getCreatedAt())
                .closedAt(session.getClosedAt())
                .build();
    }
}
