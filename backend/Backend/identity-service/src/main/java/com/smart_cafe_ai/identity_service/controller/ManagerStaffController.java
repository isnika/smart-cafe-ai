package com.smart_cafe_ai.identity_service.controller;

import com.smart_cafe_ai.identity_service.dto.*;
import com.smart_cafe_ai.identity_service.model.UserStatus;
import com.smart_cafe_ai.identity_service.security.UserPrincipal;
import com.smart_cafe_ai.identity_service.service.ManagerStaffService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping({"/manager/staff", "/api/v1/manager/staff"})
@RequiredArgsConstructor
public class ManagerStaffController {

    private final ManagerStaffService managerStaffService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<UserResponse>>> getStaffList(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "branch_id", required = false) Integer branchId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) UserStatus status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        Integer managerBranchId = (principal != null && principal.getBranchId() != null) ? principal.getBranchId() : branchId;
        Pageable pageable = PageRequest.of(Math.max(0, page - 1), Math.min(100, Math.max(1, size)));
        return ResponseEntity.ok(managerStaffService.getStaffList(managerBranchId, q, status, pageable));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<UserResponse>> createStaff(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody StaffCreateRequest request
    ) {
        Integer managerBranchId = principal != null ? principal.getBranchId() : null;
        ApiResponse<UserResponse> response = managerStaffService.createStaff(managerBranchId, request);
        return ResponseEntity.status(response.isSuccess() ? HttpStatus.CREATED : HttpStatus.BAD_REQUEST).body(response);
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<UserResponse>> getStaffById(@PathVariable String id) {
        return ResponseEntity.ok(managerStaffService.getStaffById(id));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<UserResponse>> updateStaff(
            @PathVariable String id,
            @RequestBody StaffUpdateRequest request
    ) {
        return ResponseEntity.ok(managerStaffService.updateStaff(id, request));
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<ApiResponse<UserResponse>> updateStaffStatus(
            @PathVariable String id,
            @RequestBody StaffStatusRequest request
    ) {
        return ResponseEntity.ok(managerStaffService.updateStaffStatus(id, request.getStatus()));
    }
}
