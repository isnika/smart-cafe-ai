package com.smart_cafe_ai.identity_service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {
    private boolean success;
    private T data;
    private PageMeta meta;
    private ErrorResponse error;
    private String traceId;

    public static <T> ApiResponse<T> success(T data) {
        return ApiResponse.<T>builder().success(true).data(data).build();
    }

    public static <T> ApiResponse<T> success(T data, PageMeta meta) {
        return ApiResponse.<T>builder().success(true).data(data).meta(meta).build();
    }

    public static <T> ApiResponse<T> error(String code, String message) {
        return ApiResponse.<T>builder().success(false).error(ErrorResponse.builder().code(code).message(message).build()).build();
    }
    private static <T> String $default$traceId() {
        return UUID.randomUUID().toString();
    }
    public static class ApiResponseBuilder<T> {
        private boolean success;
        private T data;
        private PageMeta meta;
        private ErrorResponse error;
        private boolean traceId$set;
        private String traceId$value;
        ApiResponseBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public ApiResponse.ApiResponseBuilder<T> success(final boolean success) {
            this.success = success;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public ApiResponse.ApiResponseBuilder<T> data(final T data) {
            this.data = data;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public ApiResponse.ApiResponseBuilder<T> meta(final PageMeta meta) {
            this.meta = meta;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public ApiResponse.ApiResponseBuilder<T> error(final ErrorResponse error) {
            this.error = error;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public ApiResponse.ApiResponseBuilder<T> traceId(final String traceId) {
            this.traceId$value = traceId;
            traceId$set = true;
            return this;
        }
        public ApiResponse<T> build() {
            String traceId$value = this.traceId$value;
            if (!this.traceId$set) traceId$value = ApiResponse.<T>$default$traceId();
            return new ApiResponse<T>(this.success, this.data, this.meta, this.error, traceId$value);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "ApiResponse.ApiResponseBuilder(success=" + this.success + ", data=" + this.data + ", meta=" + this.meta + ", error=" + this.error + ", traceId$value=" + this.traceId$value + ")";
        }
    }
    public static <T> ApiResponse.ApiResponseBuilder<T> builder() {
        return new ApiResponse.ApiResponseBuilder<T>();
    }
    public boolean isSuccess() {
        return this.success;
    }
    public T getData() {
        return this.data;
    }
    public PageMeta getMeta() {
        return this.meta;
    }
    public ErrorResponse getError() {
        return this.error;
    }
    public String getTraceId() {
        return this.traceId;
    }
    public void setSuccess(final boolean success) {
        this.success = success;
    }
    public void setData(final T data) {
        this.data = data;
    }
    public void setMeta(final PageMeta meta) {
        this.meta = meta;
    }
    public void setError(final ErrorResponse error) {
        this.error = error;
    }
    public void setTraceId(final String traceId) {
        this.traceId = traceId;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof ApiResponse)) return false;
        final ApiResponse<?> other = (ApiResponse<?>) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        if (this.isSuccess() != other.isSuccess()) return false;
        final java.lang.Object this$data = this.getData();
        final java.lang.Object other$data = other.getData();
        if (this$data == null ? other$data != null : !this$data.equals(other$data)) return false;
        final java.lang.Object this$meta = this.getMeta();
        final java.lang.Object other$meta = other.getMeta();
        if (this$meta == null ? other$meta != null : !this$meta.equals(other$meta)) return false;
        final java.lang.Object this$error = this.getError();
        final java.lang.Object other$error = other.getError();
        if (this$error == null ? other$error != null : !this$error.equals(other$error)) return false;
        final java.lang.Object this$traceId = this.getTraceId();
        final java.lang.Object other$traceId = other.getTraceId();
        if (this$traceId == null ? other$traceId != null : !this$traceId.equals(other$traceId)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof ApiResponse;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        result = result * PRIME + (this.isSuccess() ? 79 : 97);
        final java.lang.Object $data = this.getData();
        result = result * PRIME + ($data == null ? 43 : $data.hashCode());
        final java.lang.Object $meta = this.getMeta();
        result = result * PRIME + ($meta == null ? 43 : $meta.hashCode());
        final java.lang.Object $error = this.getError();
        result = result * PRIME + ($error == null ? 43 : $error.hashCode());
        final java.lang.Object $traceId = this.getTraceId();
        result = result * PRIME + ($traceId == null ? 43 : $traceId.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "ApiResponse(success=" + this.isSuccess() + ", data=" + this.getData() + ", meta=" + this.getMeta() + ", error=" + this.getError() + ", traceId=" + this.getTraceId() + ")";
    }
    public ApiResponse() {
        this.traceId = ApiResponse.$default$traceId();
    }
    public ApiResponse(final boolean success, final T data, final PageMeta meta, final ErrorResponse error, final String traceId) {
        this.success = success;
        this.data = data;
        this.meta = meta;
        this.error = error;
        this.traceId = traceId;
    }
}

