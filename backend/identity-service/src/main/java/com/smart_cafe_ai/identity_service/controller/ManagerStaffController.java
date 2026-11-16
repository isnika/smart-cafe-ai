package com.smart_cafe_ai.identity_service.controller;

import com.smart_cafe_ai.identity_service.dto.ApiResponse;
import com.smart_cafe_ai.identity_service.dto.staff.StaffCreateRequest;
import com.smart_cafe_ai.identity_service.dto.staff.StaffStatusRequest;
import com.smart_cafe_ai.identity_service.dto.staff.StaffUpdateRequest;
import com.smart_cafe_ai.identity_service.dto.user.UserResponse;
import com.smart_cafe_ai.identity_service.model.UserStatus;
import com.smart_cafe_ai.identity_service.security.UserPrincipal;
import com.smart_cafe_ai.identity_service.service.ManagerStaffService;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping({"/manager/staff", "/api/v1/manager/staff"})
public class ManagerStaffController {

    private final ManagerStaffService managerStaffService;

    public ManagerStaffController(ManagerStaffService managerStaffService) {
        this.managerStaffService = managerStaffService;
    }
    @ModelAttribute
    public void requireStoreStaffIntegration() {
        // Legacy routes must not expose all Staff accounts as a branch-scoped staff list.
        // Staff_Profiles and branch authorization are owned by Store (backend 2).
        throw new com.smart_cafe_ai.identity_service.exception.ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                "STORE_INTEGRATION_REQUIRED","Quản lý nhân viên theo chi nhánh thuộc Store Service và chưa được tích hợp. Vui lòng sử dụng API Store khi backend 2 sẵn sàng.");
    }

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
