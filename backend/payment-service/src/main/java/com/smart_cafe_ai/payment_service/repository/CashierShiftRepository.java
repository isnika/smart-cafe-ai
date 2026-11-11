package com.smart_cafe_ai.payment_service.repository;

import com.smart_cafe_ai.payment_service.entity.CashierShift;
import com.smart_cafe_ai.payment_service.enums.CashierShiftStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface CashierShiftRepository extends JpaRepository<CashierShift, Integer> {

    Optional<CashierShift> findFirstByStaffUserIdAndStatus(String staffUserId, CashierShiftStatus status);

    Optional<CashierShift> findFirstByBranchIdAndRegisterCodeAndStatus(Integer branchId, String registerCode, CashierShiftStatus status);

    Page<CashierShift> findByBranchId(Integer branchId, Pageable pageable);
}
