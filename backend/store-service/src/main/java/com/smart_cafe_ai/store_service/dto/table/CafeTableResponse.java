package com.smart_cafe_ai.store_service.dto.table;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.store_service.entity.CafeTable;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CafeTableResponse {

    private Integer id;

    @JsonProperty("branch_id")
    private Integer branchId;

    @JsonProperty("branch_name")
    private String branchName;

    @JsonProperty("table_number")
    private String tableNumber;

    @JsonProperty("qr_code")
    private String qrCode;

    @JsonProperty("is_active")
    private Boolean isActive;

    public static CafeTableResponse fromEntity(CafeTable t) {
        return CafeTableResponse.builder()
                .id(t.getId())
                .branchId(t.getBranch() != null ? t.getBranch().getId() : null)
                .branchName(t.getBranch() != null ? t.getBranch().getName() : null)
                .tableNumber(t.getTableNumber())
                .qrCode(t.getQrCode())
                .isActive(t.getIsActive())
                .build();
    }
}
