package com.smart_cafe_ai.payment_service.repository;

import com.smart_cafe_ai.payment_service.entity.Payment;
import com.smart_cafe_ai.payment_service.enums.PaymentStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentRepository extends JpaRepository<Payment, Long> {

    Optional<Payment> findByIdempotencyKey(String idempotencyKey);

    Optional<Payment> findByTransactionId(String transactionId);

    Page<Payment> findByBranchId(Integer branchId, Pageable pageable);

    Page<Payment> findByBranchIdAndStatus(Integer branchId, PaymentStatus status, Pageable pageable);

    List<Payment> findByCashierShiftId(Integer cashierShiftId);

    @Query("SELECT p FROM Payment p JOIN p.allocations a WHERE a.orderId = :orderId ORDER BY p.createdAt DESC")
    List<Payment> findByOrderId(@Param("orderId") Long orderId);

    Page<Payment> findByCreatedBy(String createdBy, Pageable pageable);
}
