package com.smart_cafe_ai.payment_service.client;

import com.smart_cafe_ai.payment_service.dto.ApiResponse;
import com.smart_cafe_ai.payment_service.dto.client.OrderDto;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@FeignClient(name = "order-service", path = "/api/v1")
public interface OrderClient {

    @GetMapping("/internal/orders/{id}")
    ApiResponse<OrderDto> getOrderById(@PathVariable("id") Long id);
}
