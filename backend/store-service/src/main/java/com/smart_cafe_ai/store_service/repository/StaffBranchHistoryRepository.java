package com.smart_cafe_ai.store_service.repository;

import com.smart_cafe_ai.store_service.entity.StaffBranchHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface StaffBranchHistoryRepository extends JpaRepository<StaffBranchHistory, Long> {
    List<StaffBranchHistory> findAllByStaffIdOrderByEffectiveDateDesc(Long staffId);
}
