package com.smart_cafe_ai.store_service.controller;

import com.smart_cafe_ai.store_service.dto.ApiResponse;
import com.smart_cafe_ai.store_service.dto.branch.BranchRequest;
import com.smart_cafe_ai.store_service.dto.branch.BranchResponse;
import com.smart_cafe_ai.store_service.dto.branch.BranchStatusRequest;
import com.smart_cafe_ai.store_service.enums.BranchStatus;
import com.smart_cafe_ai.store_service.service.BranchService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping({"/branches", "/api/v1/branches"})
@RequiredArgsConstructor
public class BranchController {

    private final BranchService branchService;

    /**
     * GET /branches
     * Danh sách chi nhánh đang hoạt động hoặc theo bộ lọc. (Public)
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<BranchResponse>>> getAllBranches(
            @RequestParam(value = "status", required = false) BranchStatus status,
            @RequestParam(value = "q", required = false) String query
    ) {
        List<BranchResponse> branches = branchService.getAllBranches(status, query);
        return ResponseEntity.ok(ApiResponse.success(branches));
    }

    /**
     * GET /branches/{id}
     * Chi tiết chi nhánh. (Public)
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<BranchResponse>> getBranchById(@PathVariable Integer id) {
        BranchResponse branch = branchService.getBranchById(id);
        return ResponseEntity.ok(ApiResponse.success(branch));
    }

    /**
     * POST /branches
     * Tạo chi nhánh. (Admin)
     */
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<BranchResponse>> createBranch(@Valid @RequestBody BranchRequest request) {
        BranchResponse created = branchService.createBranch(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(created));
    }

    /**
     * PUT /branches/{id}
     * Sửa thông tin chi nhánh. (Admin)
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<BranchResponse>> updateBranch(
            @PathVariable Integer id,
            @Valid @RequestBody BranchRequest request
    ) {
        BranchResponse updated = branchService.updateBranch(id, request);
        return ResponseEntity.ok(ApiResponse.success(updated));
    }

    /**
     * PATCH /branches/{id}/status
     * Kích hoạt/vô hiệu hóa chi nhánh. (Admin)
     */
    @PatchMapping("/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<BranchResponse>> updateBranchStatus(
            @PathVariable Integer id,
            @RequestBody BranchStatusRequest request
    ) {
        BranchResponse updated = branchService.updateBranchStatus(id, request.getStatus());
        return ResponseEntity.ok(ApiResponse.success(updated));
    }
}
