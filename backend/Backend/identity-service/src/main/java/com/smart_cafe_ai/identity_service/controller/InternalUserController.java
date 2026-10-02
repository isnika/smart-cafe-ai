package com.smart_cafe_ai.identity_service.controller;

import com.smart_cafe_ai.identity_service.dto.ApiResponse;
import com.smart_cafe_ai.identity_service.dto.BatchUserRequest;
import com.smart_cafe_ai.identity_service.dto.UserResponse;
import com.smart_cafe_ai.identity_service.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping({"/internal/users", "/api/v1/internal/users"})
@RequiredArgsConstructor
public class InternalUserController {

    private final UserService userService;

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<UserResponse>> getUserById(@PathVariable String id) {
        return ResponseEntity.ok(ApiResponse.success(userService.getUserById(id)));
    }

    @PostMapping("/batch")
    public ResponseEntity<ApiResponse<List<UserResponse>>> getBatchUsers(@RequestBody BatchUserRequest request) {
        List<String> ids = request != null && request.getIds() != null ? request.getIds() : List.of();
        return ResponseEntity.ok(ApiResponse.success(userService.getBatchUsers(ids)));
    }
}
