package com.smart_cafe_ai.engagement_service.repository;
import com.smart_cafe_ai.engagement_service.model.LoyaltyTransaction;
import com.smart_cafe_ai.engagement_service.model.Types.TransactionType;
import org.springframework.data.jpa.repository.*;
import java.util.*;
public interface LoyaltyTransactionRepository extends JpaRepository<LoyaltyTransaction, Long>, JpaSpecificationExecutor<LoyaltyTransaction> {
    Optional<LoyaltyTransaction> findByIdempotencyKey(String key);
    Optional<LoyaltyTransaction> findByOrderIdAndTransactionType(Long orderId, TransactionType type);
    @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    List<LoyaltyTransaction> findByOrderIdOrderByIdAsc(Long orderId);
    boolean existsByReversalOfId(Long id);
}
