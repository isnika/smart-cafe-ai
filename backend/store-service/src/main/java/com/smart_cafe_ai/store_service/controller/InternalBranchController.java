package com.smart_cafe_ai.store_service.controller;

import com.smart_cafe_ai.store_service.dto.ApiResponse;
import com.smart_cafe_ai.store_service.dto.branch.BranchResponse;
import com.smart_cafe_ai.store_service.service.BranchService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({"/internal/branches", "/api/v1/internal/branches"})
@RequiredArgsConstructor
public class InternalBranchController {

    private final BranchService branchService;

    /**
     * GET /internal/branches/{id}
     * Service khác kiểm tra thông tin chi nhánh, chính sách giao hàng & online order. (Internal)
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<BranchResponse>> getBranchInternal(@PathVariable Integer id) {
        BranchResponse branch = branchService.getBranchById(id);
        return ResponseEntity.ok(ApiResponse.success(branch));
    }
}
