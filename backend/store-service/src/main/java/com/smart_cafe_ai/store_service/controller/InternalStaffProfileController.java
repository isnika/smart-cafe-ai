package com.smart_cafe_ai.store_service.controller;

import com.smart_cafe_ai.store_service.dto.ApiResponse;
import com.smart_cafe_ai.store_service.dto.staff.StaffProfileResponse;
import com.smart_cafe_ai.store_service.entity.StaffProfile;
import com.smart_cafe_ai.store_service.repository.StaffProfileRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@RestController
@RequestMapping({"/internal/staff-profiles", "/api/v1/internal/staff-profiles"})
@RequiredArgsConstructor
public class InternalStaffProfileController {

    private final StaffProfileRepository staffProfileRepository;

    @Value("${app.internal-api-key:}")
    private String internalKey;

    /**
     * GET /internal/staff-profiles/by-user/{userId}
     * API nội bộ cho các service khác (order-service,...) xác thực nhân sự theo userId.
     */
    @GetMapping("/by-user/{userId}")
    public ResponseEntity<ApiResponse<StaffProfileResponse>> getStaffByUserId(
            @PathVariable String userId,
            @RequestHeader(name = "X-Service-Key", required = false) String suppliedKey
    ) {
        if (suppliedKey == null || suppliedKey.isBlank()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error("UNAUTHORIZED", "Thiếu X-Service-Key."));
        }
        if (internalKey != null && !internalKey.isBlank()) {
            if (!MessageDigest.isEqual(internalKey.getBytes(StandardCharsets.UTF_8), suppliedKey.getBytes(StandardCharsets.UTF_8))) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(ApiResponse.error("FORBIDDEN", "Khóa service nội bộ không hợp lệ."));
            }
        }

        StaffProfile profile = staffProfileRepository.findByUserId(userId).orElse(null);
        if (profile == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error("STAFF_NOT_FOUND", "Không tìm thấy hồ sơ nhân viên cho userId: " + userId));
        }

        return ResponseEntity.ok(ApiResponse.success(StaffProfileResponse.fromEntity(profile)));
    }
}
