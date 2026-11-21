package com.smart_cafe_ai.identity_service.dto.admin;

import com.fasterxml.jackson.annotation.JsonProperty;

public class AdminUserBranchRequest {
    @JsonProperty("branch_id")
    private Integer branchId;

    public AdminUserBranchRequest() {
    }

    public AdminUserBranchRequest(Integer branchId) {
        this.branchId = branchId;
    }

    public Integer getBranchId() {
        return branchId;
    }

    public void setBranchId(Integer branchId) {
        this.branchId = branchId;
    }
}
