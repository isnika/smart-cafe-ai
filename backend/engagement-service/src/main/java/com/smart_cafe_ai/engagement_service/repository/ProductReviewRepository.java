package com.smart_cafe_ai.engagement_service.repository;
import com.smart_cafe_ai.engagement_service.model.ProductReview;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import java.util.Optional;
public interface ProductReviewRepository extends JpaRepository<ProductReview, Long>, JpaSpecificationExecutor<ProductReview> {
    boolean existsByOrderItemIdAndUserId(Long orderItemId, String userId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from ProductReview r where r.id = :id")
    Optional<ProductReview> lockById(Long id);
}
