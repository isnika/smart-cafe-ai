package com.smart_cafe_ai.engagement_service.repository;
import com.smart_cafe_ai.engagement_service.model.OutboxEvent;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import java.time.Instant;
import java.util.List;
public interface OutboxEventRepository extends JpaRepository<OutboxEvent, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from OutboxEvent e where e.status in ('Pending','Failed') and (e.nextRetryAt is null or e.nextRetryAt <= :now) order by e.id")
    List<OutboxEvent> ready(Instant now, Pageable page);
}
