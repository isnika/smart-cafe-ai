package com.smart_cafe_ai.catalog_service.exception;

import com.smart_cafe_ai.catalog_service.dto.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.HttpRequestMethodNotSupportedException;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiResponse<Void>> handleApi(ApiException ex) {
        return ResponseEntity.status(ex.getStatus()).body(ApiResponse.error(ex.getCode(), ex.getMessage()));
    }

    @ExceptionHandler({MethodArgumentTypeMismatchException.class, MissingServletRequestParameterException.class,
            HandlerMethodValidationException.class})
    public ResponseEntity<ApiResponse<Void>> handleValidation(Exception ex) {
        return ResponseEntity.badRequest().body(ApiResponse.error("VALIDATION_ERROR", "Tham số đường dẫn hoặc truy vấn không hợp lệ"));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotFound(NoResourceFoundException ex) {
        return ResponseEntity.status(404).body(ApiResponse.error("NOT_FOUND", "API không tồn tại"));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiResponse<Void>> handleMethod(HttpRequestMethodNotSupportedException ex) {
        return ResponseEntity.status(405).body(ApiResponse.error("METHOD_NOT_ALLOWED", "Phương thức không được hỗ trợ"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpected(Exception ex) {
        ApiResponse<Void> body = ApiResponse.error("INTERNAL_SERVER_ERROR", "Lỗi xử lý hệ thống");
        log.error("Catalog request failed, trace_id={}", body.traceId(), ex);
        return ResponseEntity.internalServerError().body(body);
    }
}

