package com.smart_cafe_ai.store_service.repository;

import com.smart_cafe_ai.store_service.entity.CafeTable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CafeTableRepository extends JpaRepository<CafeTable, Integer> {

    @Query("SELECT t FROM CafeTable t JOIN FETCH t.branch WHERE t.branch.id = :branchId")
    List<CafeTable> findAllByBranchId(@Param("branchId") Integer branchId);

    @Query("SELECT t FROM CafeTable t JOIN FETCH t.branch WHERE t.branch.id = :branchId AND t.isActive = :isActive")
    List<CafeTable> findAllByBranchIdAndIsActive(@Param("branchId") Integer branchId, @Param("isActive") Boolean isActive);

    @Query("SELECT t FROM CafeTable t JOIN FETCH t.branch WHERE t.qrCode = :qrCode")
    Optional<CafeTable> findByQrCode(@Param("qrCode") String qrCode);

    @Query("SELECT CASE WHEN COUNT(t) > 0 THEN TRUE ELSE FALSE END FROM CafeTable t WHERE t.branch.id = :branchId AND t.tableNumber = :tableNumber")
    boolean existsByBranchIdAndTableNumber(@Param("branchId") Integer branchId, @Param("tableNumber") String tableNumber);

    @Query("SELECT t FROM CafeTable t JOIN FETCH t.branch WHERE t.qrCode = :qrCode")
    Optional<CafeTable> findByQrCodeWithBranch(@Param("qrCode") String qrCode);

    @Query("SELECT t FROM CafeTable t JOIN FETCH t.branch WHERE t.id = :id")
    Optional<CafeTable> findByIdWithBranch(@Param("id") Integer id);
}

