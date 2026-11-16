package com.smart_cafe_ai.payment_service.repository;

import com.smart_cafe_ai.payment_service.entity.RefundOrderAllocation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RefundOrderAllocationRepository extends JpaRepository<RefundOrderAllocation, Long> {

    List<RefundOrderAllocation> findByRefundId(Long refundId);

    List<RefundOrderAllocation> findByOrderId(Long orderId);
}
