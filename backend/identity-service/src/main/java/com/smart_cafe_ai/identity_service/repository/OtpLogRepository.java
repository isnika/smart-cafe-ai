package com.smart_cafe_ai.identity_service.repository;

import com.smart_cafe_ai.identity_service.model.OtpLog;
import com.smart_cafe_ai.identity_service.model.OtpPurpose;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.time.LocalDateTime;

@Repository
public interface OtpLogRepository extends JpaRepository<OtpLog, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<OtpLog> findFirstByTargetAndPurposeOrderByIdDesc(String target, OtpPurpose purpose);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<OtpLog> findFirstByTargetAndPurposeAndUserIdOrderByIdDesc(
            String target, OtpPurpose purpose, String userId);

    long countByUserIdAndPurposeAndCreatedAtAfter(String userId, OtpPurpose purpose, LocalDateTime since);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<OtpLog> findFirstByUserIdAndPurposeOrderByIdDesc(String userId, OtpPurpose purpose);

    @Modifying(flushAutomatically = true)
    @Query("UPDATE OtpLog o SET o.isUsed = true, o.usedAt = :now "
            + "WHERE o.target = :target AND o.purpose = :purpose AND o.isUsed = false "
            + "AND (:userId IS NULL OR o.userId = :userId)")
    void invalidatePrevious(@Param("target") String target, @Param("purpose") OtpPurpose purpose,
                            @Param("userId") String userId, @Param("now") LocalDateTime now);

    @Modifying(flushAutomatically = true)
    @Query("UPDATE OtpLog o SET o.isUsed = true, o.usedAt = :now "
            + "WHERE o.userId = :userId AND o.purpose = :purpose AND o.isUsed = false")
    void invalidateByUser(@Param("userId") String userId, @Param("purpose") OtpPurpose purpose,
                          @Param("now") LocalDateTime now);
}
