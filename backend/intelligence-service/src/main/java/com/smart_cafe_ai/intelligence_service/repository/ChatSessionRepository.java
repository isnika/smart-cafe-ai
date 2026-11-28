package com.smart_cafe_ai.intelligence_service.repository;

import com.smart_cafe_ai.intelligence_service.entity.ChatSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import java.util.List;

public interface ChatSessionRepository extends JpaRepository<ChatSession, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from ChatSession s where s.id = :id")
    java.util.Optional<ChatSession> findByIdForUpdate(@Param("id") Long id);

    List<ChatSession> findAllByUserIdOrderByCreatedAtDesc(String userId);

    List<ChatSession> findAllByUserIdIsNullAndGuestKeyOrderByCreatedAtDesc(String guestKey);
}
