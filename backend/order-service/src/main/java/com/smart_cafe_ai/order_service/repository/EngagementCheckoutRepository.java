package com.smart_cafe_ai.order_service.repository;

import com.smart_cafe_ai.order_service.model.EngagementCheckout;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.*;

public interface EngagementCheckoutRepository extends JpaRepository<EngagementCheckout,Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from EngagementCheckout c where c.orderId=:id")
    Optional<EngagementCheckout> lock(@Param("id") Long id);
    @Query("select c.orderId from EngagementCheckout c where c.status='Pending' and c.nextRetryAt<=:now order by c.nextRetryAt")
    List<Long> ready(@Param("now") LocalDateTime now,Pageable page);
}
