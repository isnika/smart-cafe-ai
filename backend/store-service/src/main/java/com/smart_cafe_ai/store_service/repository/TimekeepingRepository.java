package com.smart_cafe_ai.store_service.repository;

import com.smart_cafe_ai.store_service.entity.Timekeeping;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface TimekeepingRepository extends JpaRepository<Timekeeping, Long> {
    Optional<Timekeeping> findByScheduleId(Long scheduleId);

    @Query("SELECT t FROM Timekeeping t JOIN t.schedule s WHERE s.staff.id = :staffId AND s.workDate BETWEEN :startDate AND :endDate")
    List<Timekeeping> findAllByStaffIdAndDateRange(@Param("staffId") Long staffId, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    @Query("SELECT t FROM Timekeeping t JOIN t.schedule s WHERE s.branchId = :branchId AND s.workDate BETWEEN :startDate AND :endDate")
    List<Timekeeping> findAllByBranchIdAndDateRange(@Param("branchId") Integer branchId, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    @Query("SELECT t FROM Timekeeping t JOIN FETCH t.schedule s JOIN FETCH s.staff st JOIN FETCH s.shift sh " +
           "WHERE (:branchId IS NULL OR s.branchId = :branchId) " +
           "AND (:staffId IS NULL OR st.id = :staffId) " +
           "AND (s.workDate BETWEEN :startDate AND :endDate) " +
           "ORDER BY s.workDate DESC, t.checkIn DESC")
    List<Timekeeping> findTimekeepingsFiltered(
            @Param("branchId") Integer branchId,
            @Param("staffId") Long staffId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate
    );
}
