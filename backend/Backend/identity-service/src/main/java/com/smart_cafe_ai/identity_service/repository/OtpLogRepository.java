package com.smart_cafe_ai.identity_service.repository;

import com.smart_cafe_ai.identity_service.model.OtpLog;
import com.smart_cafe_ai.identity_service.model.OtpPurpose;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface OtpLogRepository extends JpaRepository<OtpLog, Long> {
    Optional<OtpLog> findFirstByPhoneEmailAndPurposeAndIsUsedFalseOrderByCreatedAtDesc(String phoneEmail, OtpPurpose purpose);
}
