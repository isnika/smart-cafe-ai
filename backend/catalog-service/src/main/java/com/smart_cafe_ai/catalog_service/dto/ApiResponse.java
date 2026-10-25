package com.smart_cafe_ai.catalog_service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiResponse<T>(boolean success, T data, String message, PageMeta meta, ApiError error,
                             @JsonProperty("trace_id") String traceId) {
    public static <T> ApiResponse<T> success(T data) { return success(data, null, null); }
    public static <T> ApiResponse<T> success(T data, String message) { return success(data, null, message); }
    public static <T> ApiResponse<T> success(T data, PageMeta meta) {
        return success(data, meta, null);
    }
    public static <T> ApiResponse<T> success(T data, PageMeta meta, String message) {
        return new ApiResponse<>(true, data, message, meta, null, UUID.randomUUID().toString());
    }
    public static ApiResponse<Void> error(String code, String message) {
        return new ApiResponse<>(false, null, null, null, new ApiError(code, message, List.of()), UUID.randomUUID().toString());
    }
    public record ApiError(String code, String message, List<Object> details) {}
    public record PageMeta(int page, int size, long total, @JsonProperty("total_pages") int totalPages) {}
}

