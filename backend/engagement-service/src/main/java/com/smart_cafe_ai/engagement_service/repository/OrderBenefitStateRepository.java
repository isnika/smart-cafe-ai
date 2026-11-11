package com.smart_cafe_ai.engagement_service.repository;

import com.smart_cafe_ai.engagement_service.model.OrderBenefitState;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface OrderBenefitStateRepository extends JpaRepository<OrderBenefitState,Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from OrderBenefitState s where s.orderId=:id")
    Optional<OrderBenefitState> lock(@Param("id") Long id);
}
