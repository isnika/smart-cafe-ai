package com.smart_cafe_ai.store_service.dto.branch;

import com.smart_cafe_ai.store_service.enums.BranchStatus;
import lombok.Data;

@Data
public class BranchStatusRequest {
    private BranchStatus status;
}
