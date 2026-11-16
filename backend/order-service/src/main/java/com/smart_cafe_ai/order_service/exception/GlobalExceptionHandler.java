package com.smart_cafe_ai.order_service.exception;
import com.smart_cafe_ai.order_service.dto.ApiResponse;
import org.springframework.dao.*;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import jakarta.validation.ConstraintViolationException;
@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(GlobalExceptionHandler.class);
    @ExceptionHandler(ApiException.class) ResponseEntity<ApiResponse> api(ApiException ex){return ResponseEntity.status(ex.status).body(ApiResponse.error(ex.code,ex.getMessage()));}
    @ExceptionHandler({MethodArgumentNotValidException.class,MethodArgumentTypeMismatchException.class,
            HttpMessageNotReadableException.class,MissingRequestHeaderException.class,MissingServletRequestParameterException.class,
            ConstraintViolationException.class,HandlerMethodValidationException.class})
    ResponseEntity<ApiResponse> validation(Exception ex){return ResponseEntity.badRequest().body(ApiResponse.error("VALIDATION_ERROR","Payload, header hoặc tham số không hợp lệ."));}
    @ExceptionHandler({OptimisticLockingFailureException.class,jakarta.persistence.OptimisticLockException.class})
    ResponseEntity<ApiResponse> version(Exception ex){return ResponseEntity.status(409).body(ApiResponse.error("VERSION_CONFLICT","Đơn đã thay đổi. Hãy tải lại dữ liệu và thử lại."));}
    @ExceptionHandler({DataIntegrityViolationException.class,PessimisticLockingFailureException.class})
    ResponseEntity<ApiResponse> conflict(Exception ex){return ResponseEntity.status(409).body(ApiResponse.error("CONFLICT","Dữ liệu đã thay đổi hoặc yêu cầu bị trùng. Hãy tải lại và thử lại."));}
    @ExceptionHandler(Exception.class) ResponseEntity<ApiResponse> unexpected(Exception ex){log.error("Order request failed",ex);return ResponseEntity.internalServerError().body(ApiResponse.error("INTERNAL_ERROR","Không thể xử lý yêu cầu."));}
}
