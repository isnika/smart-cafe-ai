package com.smart_cafe_ai.payment_service.client;

import com.smart_cafe_ai.payment_service.dto.ApiResponse;
import com.smart_cafe_ai.payment_service.dto.client.TableSessionDto;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;

@FeignClient(name = "store-service", path = "/api/v1")
public interface StoreClient {

    @GetMapping("/internal/table-sessions/{id}")
    ApiResponse<TableSessionDto> getTableSessionById(@PathVariable("id") Long id);

    @PostMapping("/internal/table-sessions/{id}/close")
    ApiResponse<Void> closeTableSession(@PathVariable("id") Long id);
}
