package com.smart_cafe_ai.store_service.client;

import com.smart_cafe_ai.store_service.dto.ApiResponse;
import com.smart_cafe_ai.store_service.dto.identity.UserInfo;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;

/**
 * Feign client giao tiếp với identity-service qua Eureka / API Gateway.
 *
 * - Khi dùng Eureka: url để trống, Spring Cloud LoadBalancer tự resolve.
 * - Khi cần đi qua Gateway: đổi name = "api-gateway" và prefix path phù hợp.
 */
@FeignClient(name = "identity-service", path = "/internal/users")
public interface IdentityServiceClient {

    /**
     * Lấy thông tin user theo ID từ identity-service (internal endpoint).
     * Header Authorization được forward từ request hiện tại qua RequestInterceptor.
     */
    @GetMapping("/{id}")
    ApiResponse<UserInfo> getUserById(
            @PathVariable("id") String id,
            @RequestHeader("Authorization") String bearerToken
    );
}
