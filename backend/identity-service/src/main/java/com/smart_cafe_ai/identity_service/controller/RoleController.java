package com.smart_cafe_ai.identity_service.controller;

import com.smart_cafe_ai.identity_service.dto.ApiResponse;
import com.smart_cafe_ai.identity_service.dto.RoleRequest;
import com.smart_cafe_ai.identity_service.dto.RoleResponse;
import com.smart_cafe_ai.identity_service.service.RoleService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping({"/admin/roles", "/api/v1/admin/roles", "/api/roles"})
@RequiredArgsConstructor
public class RoleController {

    private final RoleService roleService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<RoleResponse>>> getRoles() {
        return ResponseEntity.ok(roleService.getAllRoles());
    }

    @PostMapping
    public ResponseEntity<ApiResponse<RoleResponse>> createRole(@RequestBody RoleRequest request) {
        ApiResponse<RoleResponse> response = roleService.createRole(request);
        return ResponseEntity.status(response.isSuccess() ? HttpStatus.CREATED : HttpStatus.BAD_REQUEST).body(response);
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<RoleResponse>> updateRole(
            @PathVariable Integer id,
            @RequestBody RoleRequest request
    ) {
        return ResponseEntity.ok(roleService.updateRole(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteRole(@PathVariable Integer id) {
        ApiResponse<Void> response = roleService.deleteRole(id);
        return ResponseEntity.status(response.isSuccess() ? HttpStatus.NO_CONTENT : HttpStatus.CONFLICT).body(response);
    }
}
