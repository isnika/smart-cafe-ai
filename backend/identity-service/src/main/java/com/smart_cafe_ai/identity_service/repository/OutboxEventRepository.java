package com.smart_cafe_ai.identity_service.repository;

import com.smart_cafe_ai.identity_service.model.OutboxEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.time.LocalDateTime;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

@Repository
public interface OutboxEventRepository extends JpaRepository<OutboxEvent, Long> {
    List<OutboxEvent> findByStatusOrderByCreatedAtAsc(OutboxEvent.OutboxStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from OutboxEvent e where e.eventType = :type and e.status = :status "
            + "and (e.nextRetryAt is null or e.nextRetryAt <= :now) order by e.id")
    List<OutboxEvent> findReadyOtpEmails(@Param("type") String type,
            @Param("status") OutboxEvent.OutboxStatus status, @Param("now") LocalDateTime now,
            Pageable pageable);
}
