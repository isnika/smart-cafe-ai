package com.smart_cafe_ai.store_service.client;

import com.smart_cafe_ai.store_service.dto.ApiResponse;
import com.smart_cafe_ai.store_service.dto.identity.BatchUserRequest;
import com.smart_cafe_ai.store_service.dto.identity.UserInfo;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Feign client giao tiếp với identity-service qua Eureka / API Gateway hoặc direct URL.
 */
@FeignClient(name = "identity-service", url = "${IDENTITY_SERVICE_URL:}", path = "/internal/users")
public interface IdentityServiceClient {

    /**
     * Lấy thông tin user theo ID từ identity-service (internal endpoint).
     */
    @GetMapping("/{id}")
    ApiResponse<UserInfo> getUserById(
            @PathVariable("id") String id,
            @RequestHeader(value = "Authorization", required = false) String bearerToken
    );

    /**
     * Lấy thông tin danh sách users theo batch IDs từ identity-service.
     */
    @PostMapping("/batch")
    ApiResponse<List<UserInfo>> getBatchUsers(
            @RequestBody BatchUserRequest request,
            @RequestHeader(value = "Authorization", required = false) String bearerToken
    );
}
