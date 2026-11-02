package com.smart_cafe_ai.store_service.repository;

import com.smart_cafe_ai.store_service.entity.TableSession;
import com.smart_cafe_ai.store_service.enums.TableSessionStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TableSessionRepository extends JpaRepository<TableSession, Long> {

    /**
     * Lấy phiên đang Active của một bàn (để implement BR-STO-02).
     */
    Optional<TableSession> findByTableIdAndStatus(Integer tableId, TableSessionStatus status);

    /**
     * Tìm phiên theo session_code (dùng cho Header X-Table-Session-Code).
     */
    Optional<TableSession> findBySessionCode(String sessionCode);

    /**
     * Danh sách phiên đang mở của một chi nhánh.
     */
    @Query("SELECT s FROM TableSession s JOIN FETCH s.table t JOIN FETCH t.branch b " +
           "WHERE b.id = :branchId AND s.status IN :statuses ORDER BY s.openedAt DESC")
    List<TableSession> findActiveSessionsByBranch(
            @Param("branchId") Integer branchId,
            @Param("statuses") List<TableSessionStatus> statuses
    );

    /**
     * Kiểm tra bàn hiện có phiên Active hoặc Payment_Pending không.
     */
    boolean existsByTableIdAndStatusIn(Integer tableId, List<TableSessionStatus> statuses);
}
