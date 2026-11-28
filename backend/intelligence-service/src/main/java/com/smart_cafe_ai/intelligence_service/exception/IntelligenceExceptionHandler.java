package com.smart_cafe_ai.intelligence_service.exception;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.server.ResponseStatusException;

import java.net.SocketTimeoutException;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Giữ error contract của intelligence-service ổn định với frontend. */
@RestControllerAdvice
public class IntelligenceExceptionHandler {

    @ExceptionHandler(RestClientResponseException.class)
    public ResponseEntity<Map<String, Object>> handleAiResponse(
            RestClientResponseException ex,
            HttpServletRequest request
    ) {
        int downstreamStatus = ex.getStatusCode().value();
        int status = downstreamStatus >= 500 ? 503 : downstreamStatus;
        return error(
                status,
                status == 503 ? "AI_SERVICE_ERROR" : "AI_SERVICE_REQUEST_REJECTED",
                status == 503
                        ? "Dịch vụ AI tạm thời không sẵn sàng."
                        : "Dịch vụ AI không chấp nhận yêu cầu.",
                request
        );
    }

    @ExceptionHandler(ResourceAccessException.class)
    public ResponseEntity<Map<String, Object>> handleAiAccess(
            ResourceAccessException ex,
            HttpServletRequest request
    ) {
        boolean timeout = hasTimeoutCause(ex);
        return error(
                timeout ? 504 : 503,
                timeout ? "AI_SERVICE_TIMEOUT" : "AI_SERVICE_UNAVAILABLE",
                timeout
                        ? "Dịch vụ AI phản hồi quá thời gian cho phép."
                        : "Không thể kết nối tới dịch vụ AI.",
                request
        );
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleInvalidRequest(
            HttpMessageNotReadableException ex,
            HttpServletRequest request
    ) {
        return error(400, "VALIDATION_ERROR", "Payload chat không hợp lệ.", request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(
            MethodArgumentNotValidException ex,
            HttpServletRequest request
    ) {
        return error(400, "VALIDATION_ERROR", "Payload chat không hợp lệ.", request);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleChatStatus(
            ResponseStatusException ex,
            HttpServletRequest request
    ) {
        int status = ex.getStatusCode().value();
        String message = switch (status) {
            case 400 -> "Yêu cầu chat không hợp lệ.";
            case 401 -> "Phiên đăng nhập hoặc guest key không hợp lệ.";
            case 404 -> "Không tìm thấy phiên chat.";
            case 409 -> "Phiên chat không thể tiếp tục thao tác này.";
            default -> status >= 500 ? "Dịch vụ chat tạm thời chưa sẵn sàng." : "Yêu cầu chat không được chấp nhận.";
        };
        return error(status, status >= 500 ? "CHAT_SERVICE_ERROR" : "CHAT_REQUEST_REJECTED", message, request);
    }

    private ResponseEntity<Map<String, Object>> error(
            int status,
            String code,
            String message,
            HttpServletRequest request
    ) {
        String traceId = request.getHeader("X-Trace-Id");
        if (traceId == null || traceId.isBlank()) {
            traceId = UUID.randomUUID().toString();
        }
        Map<String, Object> body = Map.of(
                "success", false,
                "error", Map.of("code", code, "message", message, "details", List.of()),
                "trace_id", traceId
        );
        return ResponseEntity.status(HttpStatus.valueOf(status))
                .header("X-Trace-Id", traceId)
                .body(body);
    }

    private boolean hasTimeoutCause(Throwable error) {
        for (Throwable current = error; current != null; current = current.getCause()) {
            if (current instanceof SocketTimeoutException) {
                return true;
            }
            String message = current.getMessage();
            if (message != null && message.toLowerCase().contains("timed out")) {
                return true;
            }
        }
        return false;
    }
}
