package com.smart_cafe_ai.payment_service.dto.client;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
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
public class OrderDto {
    private Long id;

    @JsonProperty("branch_id")
    @JsonAlias({"branchId", "branch_id"})
    private Integer branchId;

    @JsonProperty("final_amount")
    @JsonAlias({"total_amount", "totalAmount", "final_amount", "finalAmount"})
    private BigDecimal totalAmount;

    private String status;
    private List<OrderItemDto> items;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class OrderItemDto {
        private Long id;
        private Long variantId;
        private String itemName;
        private Integer quantity;
        private BigDecimal unitPrice;
        private BigDecimal totalPrice;
    }
}
