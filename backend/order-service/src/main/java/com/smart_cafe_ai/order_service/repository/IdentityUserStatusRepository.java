package com.smart_cafe_ai.order_service.repository;

import com.smart_cafe_ai.order_service.model.IdentityUserStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface IdentityUserStatusRepository extends JpaRepository<IdentityUserStatus, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from IdentityUserStatus s where s.userId = :userId")
    Optional<IdentityUserStatus> lockByUserId(@Param("userId") String userId);
}
