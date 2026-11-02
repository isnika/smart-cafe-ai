package com.smart_cafe_ai.engagement_service.repository;
import com.smart_cafe_ai.engagement_service.model.LoyaltyCard;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import java.util.Optional;
public interface LoyaltyCardRepository extends JpaRepository<LoyaltyCard, Long> {
    Optional<LoyaltyCard> findByUserId(String userId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from LoyaltyCard c where c.userId = :userId")
    Optional<LoyaltyCard> lockByUserId(String userId);
}
