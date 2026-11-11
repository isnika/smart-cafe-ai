package com.smart_cafe_ai.store_service.controller;

import com.smart_cafe_ai.store_service.dto.ApiResponse;
import com.smart_cafe_ai.store_service.dto.branch.BranchResponse;
import com.smart_cafe_ai.store_service.service.BranchService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestHeader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@RestController
@RequestMapping({"/internal/branches", "/api/v1/internal/branches"})
@RequiredArgsConstructor
public class InternalBranchController {

    private final BranchService branchService;
    @Value("${app.internal-api-key:}")
    private String internalKey;

    /**
     * GET /internal/branches/{id}
     * Service khác kiểm tra thông tin chi nhánh, chính sách giao hàng & online order. (Internal)
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<BranchResponse>> getBranchInternal(@PathVariable Integer id,
            @RequestHeader(name = "X-Service-Key", required = false) String suppliedKey) {
        if (suppliedKey == null || suppliedKey.isBlank())
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error("UNAUTHORIZED", "Thiếu X-Service-Key."));
        if (internalKey.isBlank())
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(ApiResponse.error("INTERNAL_AUTH_NOT_CONFIGURED", "Chưa cấu hình STORE_INTERNAL_API_KEY."));
        if (!MessageDigest.isEqual(internalKey.getBytes(StandardCharsets.UTF_8), suppliedKey.getBytes(StandardCharsets.UTF_8)))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(ApiResponse.error("FORBIDDEN", "Khóa service nội bộ không hợp lệ."));
        BranchResponse branch = branchService.getBranchById(id);
        return ResponseEntity.ok(ApiResponse.success(branch));
    }
}
