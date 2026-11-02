package com.smart_cafe_ai.payment_service.repository;

import com.smart_cafe_ai.payment_service.entity.Refund;
import com.smart_cafe_ai.payment_service.enums.RefundStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RefundRepository extends JpaRepository<Refund, Long> {

    List<Refund> findByPaymentId(Long paymentId);

    Page<Refund> findByStatus(RefundStatus status, Pageable pageable);

    Page<Refund> findByRequestedBy(String requestedBy, Pageable pageable);
}
