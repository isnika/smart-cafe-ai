package com.smart_cafe_ai.payment_service.repository;

import com.smart_cafe_ai.payment_service.entity.CashMovement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CashMovementRepository extends JpaRepository<CashMovement, Long> {

    List<CashMovement> findByCashierShiftIdOrderByCreatedAtDesc(Integer cashierShiftId);
}
