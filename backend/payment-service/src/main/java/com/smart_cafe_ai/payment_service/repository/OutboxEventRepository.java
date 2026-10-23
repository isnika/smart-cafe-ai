package com.smart_cafe_ai.payment_service.repository;

import com.smart_cafe_ai.payment_service.entity.OutboxEvent;
import com.smart_cafe_ai.payment_service.enums.OutboxStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface OutboxEventRepository extends JpaRepository<OutboxEvent, Long> {

    Optional<OutboxEvent> findByEventId(String eventId);

    @Query("SELECT e FROM OutboxEvent e WHERE e.status = :status AND (e.nextRetryAt IS NULL OR e.nextRetryAt <= :now) ORDER BY e.createdAt ASC")
    List<OutboxEvent> findPendingEventsToPublish(
            @Param("status") OutboxStatus status,
            @Param("now") LocalDateTime now,
            Pageable pageable
    );
}
