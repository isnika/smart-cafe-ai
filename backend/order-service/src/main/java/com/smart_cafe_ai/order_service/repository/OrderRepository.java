package com.smart_cafe_ai.order_service.repository;
import com.smart_cafe_ai.order_service.model.*;
import com.smart_cafe_ai.order_service.model.Types.*;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Pageable;
import java.time.LocalDateTime;
import java.util.*;
public interface OrderRepository extends JpaRepository<CafeOrder,Long>,JpaSpecificationExecutor<CafeOrder> {
    Optional<CafeOrder> findByIdempotencyKey(String key);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select o from CafeOrder o where o.id=:id") Optional<CafeOrder> lock(@Param("id") Long id);
    List<CafeOrder> findByTableSessionIdAndPaymentStatusOrderById(Long session,PaymentStatus payment);
    List<CafeOrder> findByTableSessionIdOrderById(Long session);
    @Query("select o.id from CafeOrder o where o.status=:status and o.expiresAt<=:now order by o.id")
    List<Long> expired(@Param("status") Status status,@Param("now") LocalDateTime now,Pageable page);
}
