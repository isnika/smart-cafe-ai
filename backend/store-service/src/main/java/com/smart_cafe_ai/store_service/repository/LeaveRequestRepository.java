package com.smart_cafe_ai.store_service.repository;

import com.smart_cafe_ai.store_service.entity.LeaveRequest;
import com.smart_cafe_ai.store_service.enums.LeaveStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface LeaveRequestRepository extends JpaRepository<LeaveRequest, Long> {
    List<LeaveRequest> findAllByStaffId(Long staffId);
    List<LeaveRequest> findAllByStaffIdAndStatus(Long staffId, LeaveStatus status);

    @Query("SELECT l FROM LeaveRequest l JOIN l.staff s WHERE s.branch.id = :branchId AND (:status IS NULL OR l.status = :status)")
    List<LeaveRequest> findAllByBranchIdAndStatus(@Param("branchId") Integer branchId, @Param("status") LeaveStatus status);

    @Query("SELECT COUNT(l) > 0 FROM LeaveRequest l WHERE l.staff.id = :staffId " +
           "AND l.status IN (com.smart_cafe_ai.store_service.enums.LeaveStatus.Pending, com.smart_cafe_ai.store_service.enums.LeaveStatus.Approved) " +
           "AND (l.startDate <= :endDate AND l.endDate >= :startDate)")
    boolean hasOverlappingLeave(
            @Param("staffId") Long staffId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate
    );

    @Query("SELECT l FROM LeaveRequest l JOIN FETCH l.staff s JOIN FETCH s.branch b " +
           "WHERE (:branchId IS NULL OR b.id = :branchId) " +
           "AND (:staffId IS NULL OR s.id = :staffId) " +
           "AND (:status IS NULL OR l.status = :status) " +
           "ORDER BY l.createdAt DESC")
    List<LeaveRequest> findLeaveRequestsFiltered(
            @Param("branchId") Integer branchId,
            @Param("staffId") Long staffId,
            @Param("status") LeaveStatus status
    );
}
