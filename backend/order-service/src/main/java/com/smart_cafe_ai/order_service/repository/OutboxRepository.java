package com.smart_cafe_ai.order_service.repository;
import com.smart_cafe_ai.order_service.model.OutboxEvent;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;
public interface OutboxRepository extends JpaRepository<OutboxEvent,Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from OutboxEvent e where e.status='Pending' and (e.nextRetryAt is null or e.nextRetryAt<=:now) and not exists (select p.id from OutboxEvent p where p.aggregateId=e.aggregateId and p.id<e.id and p.status<>'Published') order by e.id")
    List<OutboxEvent> ready(@Param("now") LocalDateTime now,Pageable page);
}
