package com.smart_cafe_ai.engagement_service.repository;
import com.smart_cafe_ai.engagement_service.model.VoucherRedemption;
import com.smart_cafe_ai.engagement_service.model.Types.RedemptionStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface VoucherRedemptionRepository extends JpaRepository<VoucherRedemption, Long> {
    Optional<VoucherRedemption> findByVoucherIdAndOrderId(Long voucherId, Long orderId);
    long countByVoucherIdAndUserIdAndStatus(Long voucherId, String userId, RedemptionStatus status);
    List<VoucherRedemption> findByOrderIdOrderByVoucherIdAsc(Long orderId);
}
