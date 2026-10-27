package com.smart_cafe_ai.inventory_service.dto;

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
    private long totalElements;
    private int totalPages;
}
