package com.smart_cafe_ai.engagement_service.repository;
import com.smart_cafe_ai.engagement_service.model.VerifiedPurchase;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface VerifiedPurchaseRepository extends JpaRepository<VerifiedPurchase, Long> {
    boolean existsByOrderItemIdAndUserIdAndProductId(Long orderItemId, String userId, Integer productId);
    List<VerifiedPurchase> findByOrderId(Long orderId);
}
