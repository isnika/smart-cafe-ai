package com.smart_cafe_ai.identity_service.exception;

import com.fasterxml.jackson.databind.exc.MismatchedInputException;
import com.smart_cafe_ai.identity_service.dto.ApiResponse;
import com.smart_cafe_ai.identity_service.dto.user.UpdateProfileRequest;
import com.smart_cafe_ai.identity_service.dto.user.UpdateContactRequest;
import com.smart_cafe_ai.identity_service.dto.auth.RegisterRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiResponse<Void>> handleApiException(ApiException ex) {
        var response = ResponseEntity.status(ex.getStatus());
        if (ex.getRetryAfterSeconds() != null) response.header(HttpHeaders.RETRY_AFTER, ex.getRetryAfterSeconds().toString());
        return response.body(ApiResponse.error(ex.getCode(), ex.getMessage()));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleConflict(DataIntegrityViolationException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiResponse.error("CONFLICT",
                "Dữ liệu bị trùng hoặc xung đột; email hoặc số điện thoại có thể đã được tài khoản khác sử dụng"));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiResponse<Void>> handleUploadTooLarge(MaxUploadSizeExceededException ex) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(ApiResponse.error("FILE_TOO_LARGE", "Ảnh tối đa 5 MB, tổng request tối đa 10 MB"));
    }

    @ExceptionHandler(MultipartException.class)
    public ResponseEntity<ApiResponse<Void>> handleInvalidMultipart(MultipartException ex) {
        return ResponseEntity.badRequest().body(ApiResponse.error("VALIDATION_ERROR", "Cần gửi multipart/form-data với trường file hợp lệ"));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotFound(NoResourceFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error("NOT_FOUND", "API không tồn tại"));
    }

    @ExceptionHandler(OtpLockedException.class)
    public ResponseEntity<ApiResponse<Void>> handleOtpLocked(OtpLockedException ex) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, Long.toString(ex.getRetryAfterSeconds()))
                .body(ApiResponse.error("OTP_TOO_MANY_ATTEMPTS", ex.getMessage()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleInvalidJson(HttpMessageNotReadableException ex) {
        if (ex.getCause() instanceof MismatchedInputException mismatch && mismatch.getTargetType() == String.class
                && !mismatch.getPath().isEmpty()) {
            var reference = mismatch.getPath().get(mismatch.getPath().size() - 1);
            if (reference.getFrom() instanceof UpdateProfileRequest || reference.getFrom() instanceof UpdateContactRequest
                    || reference.getFrom() instanceof RegisterRequest) {
                return ResponseEntity.badRequest().body(ApiResponse.error("VALIDATION_ERROR",
                        reference.getFieldName() + " phải là chuỗi văn bản"));
            }
        }
        return ResponseEntity.badRequest().body(ApiResponse.error("VALIDATION_ERROR", "Nội dung JSON không hợp lệ"));
    }

    @ExceptionHandler(GoogleAuthException.class)
    public ResponseEntity<ApiResponse<Void>> handleGoogleAuthException(GoogleAuthException ex) {
        return ResponseEntity.status(ex.getStatus())
                .body(ApiResponse.error(ex.getCode(), ex.getMessage()));
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ApiResponse<Void>> handleRuntimeException(RuntimeException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error("BAD_REQUEST", ex.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGeneralException(Exception ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error("INTERNAL_SERVER_ERROR", ex.getMessage() != null ? ex.getMessage() : "Lỗi xử lý hệ thống"));
    }
}
