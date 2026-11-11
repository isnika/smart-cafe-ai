package com.smart_cafe_ai.store_service.dto.session;

import com.smart_cafe_ai.store_service.enums.TableSessionStatus;
import lombok.Data;

@Data
public class TableSessionStatusRequest {
    private TableSessionStatus status;
}
