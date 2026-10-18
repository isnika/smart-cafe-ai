package com.smart_cafe_ai.store_service.repository;

import com.smart_cafe_ai.store_service.entity.StaffProfile;
import com.smart_cafe_ai.store_service.enums.StaffStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface StaffProfileRepository extends JpaRepository<StaffProfile, Long> {

    Optional<StaffProfile> findByUserId(String userId);

    Optional<StaffProfile> findByEmployeeCode(String employeeCode);

    List<StaffProfile> findAllByBranchId(Integer branchId);

    List<StaffProfile> findAllByBranchIdAndStatus(Integer branchId, StaffStatus status);

    boolean existsByEmployeeCode(String employeeCode);

    boolean existsByUserId(String userId);

    @Query("SELECT s FROM StaffProfile s JOIN FETCH s.branch WHERE s.id = :id")
    Optional<StaffProfile> findByIdWithBranch(@Param("id") Long id);
}
