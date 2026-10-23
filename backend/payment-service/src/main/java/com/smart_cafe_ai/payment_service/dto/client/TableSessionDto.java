package com.smart_cafe_ai.payment_service.dto.client;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TableSessionDto {
    private Long id;
    private Integer branchId;
    private Integer tableId;
    private String status;
    private BigDecimal totalAmount;
    private List<Long> orderIds;
}
