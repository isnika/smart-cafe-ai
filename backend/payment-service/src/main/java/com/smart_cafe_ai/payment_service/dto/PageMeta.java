package com.smart_cafe_ai.payment_service.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PageMeta {
    private int page;
    private int size;
    private long totalItems;
    private int totalPages;
}
