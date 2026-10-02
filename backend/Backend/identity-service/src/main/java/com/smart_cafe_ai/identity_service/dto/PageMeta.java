package com.smart_cafe_ai.identity_service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
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
    @JsonProperty("total_items")
    private long totalItems;
    @JsonProperty("total_pages")
    private int totalPages;
}
