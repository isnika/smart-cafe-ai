package com.smart_cafe_ai.store_service.service;

import com.smart_cafe_ai.store_service.dto.branch.BranchRequest;
import com.smart_cafe_ai.store_service.dto.branch.BranchResponse;
import com.smart_cafe_ai.store_service.enums.BranchStatus;

import java.util.List;

public interface BranchService {

    List<BranchResponse> getAllBranches(BranchStatus status, String query);

    BranchResponse getBranchById(Integer id);

    BranchResponse createBranch(BranchRequest request);

    BranchResponse updateBranch(Integer id, BranchRequest request);

    BranchResponse updateBranchStatus(Integer id, BranchStatus status);
}
