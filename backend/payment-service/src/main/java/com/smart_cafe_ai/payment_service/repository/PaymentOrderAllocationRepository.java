package com.smart_cafe_ai.payment_service.repository;

import com.smart_cafe_ai.payment_service.entity.PaymentOrderAllocation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PaymentOrderAllocationRepository extends JpaRepository<PaymentOrderAllocation, Long> {

    List<PaymentOrderAllocation> findByPaymentId(Long paymentId);

    List<PaymentOrderAllocation> findByOrderId(Long orderId);
}
