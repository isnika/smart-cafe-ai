package com.smart_cafe_ai.store_service.repository;

import com.smart_cafe_ai.store_service.entity.Schedule;
import com.smart_cafe_ai.store_service.enums.ScheduleStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

@Repository
public interface ScheduleRepository extends JpaRepository<Schedule, Long> {
    List<Schedule> findAllByBranchIdAndWorkDateBetween(Integer branchId, LocalDate startDate, LocalDate endDate);
    List<Schedule> findAllByStaffIdAndWorkDateBetween(Long staffId, LocalDate startDate, LocalDate endDate);
    Optional<Schedule> findByStaffIdAndWorkDate(Long staffId, LocalDate workDate);
    boolean existsByStaffIdAndWorkDate(Long staffId, LocalDate workDate);
    List<Schedule> findAllByStaffIdAndWorkDateBetweenAndStatusNot(Long staffId, LocalDate startDate, LocalDate endDate, ScheduleStatus status);

    @Query("SELECT s FROM Schedule s JOIN FETCH s.staff st JOIN FETCH s.shift sh " +
           "WHERE (:branchId IS NULL OR s.branchId = :branchId) " +
           "AND (:staffId IS NULL OR s.staff.id = :staffId) " +
           "AND (:shiftId IS NULL OR s.shift.id = :shiftId) " +
           "AND (:status IS NULL OR s.status = :status) " +
           "AND (s.workDate BETWEEN :startDate AND :endDate) " +
           "ORDER BY s.workDate ASC, s.shift.startTime ASC")
    List<Schedule> findSchedulesFiltered(
            @Param("branchId") Integer branchId,
            @Param("staffId") Long staffId,
            @Param("shiftId") Integer shiftId,
            @Param("status") ScheduleStatus status,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate
    );
}
