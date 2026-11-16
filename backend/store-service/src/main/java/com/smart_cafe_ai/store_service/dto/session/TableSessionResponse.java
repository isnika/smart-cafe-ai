package com.smart_cafe_ai.store_service.dto.session;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.store_service.entity.TableSession;
import com.smart_cafe_ai.store_service.enums.TableSessionStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TableSessionResponse {

    private Long id;

    @JsonProperty("table_id")
    private Integer tableId;

    @JsonProperty("table_number")
    private String tableNumber;

    @JsonProperty("branch_id")
    private Integer branchId;

    @JsonProperty("session_code")
    private String sessionCode;

    @JsonProperty("customer_id")
    private String customerId;

    private TableSessionStatus status;

    @JsonProperty("opened_at")
    private LocalDateTime openedAt;

    @JsonProperty("expires_at")
    private LocalDateTime expiresAt;

    @JsonProperty("closed_at")
    private LocalDateTime closedAt;

    public static TableSessionResponse fromEntity(TableSession s) {
        return TableSessionResponse.builder()
                .id(s.getId())
                .tableId(s.getTable() != null ? s.getTable().getId() : null)
                .tableNumber(s.getTable() != null ? s.getTable().getTableNumber() : null)
                .branchId(s.getTable() != null && s.getTable().getBranch() != null
                        ? s.getTable().getBranch().getId() : null)
                .sessionCode(s.getSessionCode())
                .customerId(s.getCustomerId())
                .status(s.getStatus())
                .openedAt(s.getOpenedAt())
                .expiresAt(s.getExpiresAt())
                .closedAt(s.getClosedAt())
                .build();
    }
}
