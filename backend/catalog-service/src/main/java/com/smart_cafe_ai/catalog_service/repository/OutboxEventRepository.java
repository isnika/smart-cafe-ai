package com.smart_cafe_ai.catalog_service.repository;

import com.smart_cafe_ai.catalog_service.model.OutboxEvent;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;

public interface OutboxEventRepository extends JpaRepository<OutboxEvent, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from OutboxEvent e where e.eventType in :types and e.status = :status " +
            "and (e.nextRetryAt is null or e.nextRetryAt <= :now) " +
            "and not exists (select older.id from OutboxEvent older where older.aggregateType=e.aggregateType " +
            "and older.aggregateId=e.aggregateId and older.id<e.id and older.status=:status) order by e.id")
    List<OutboxEvent> findReadyEvents(@Param("types") java.util.Collection<String> types,@Param("status") OutboxEvent.Status status,
                                    @Param("now") LocalDateTime now,Pageable pageable);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from OutboxEvent e where e.eventType = :type and e.status = :status " +
            "and (e.nextRetryAt is null or e.nextRetryAt <= :now) " +
            "and not exists (select older.id from OutboxEvent older where older.aggregateType = e.aggregateType " +
            "and older.aggregateId = e.aggregateId and older.id < e.id and older.status = :status) order by e.id")
    List<OutboxEvent> findReady(@Param("type") String type, @Param("status") OutboxEvent.Status status,
                              @Param("now") LocalDateTime now, Pageable pageable);
}
