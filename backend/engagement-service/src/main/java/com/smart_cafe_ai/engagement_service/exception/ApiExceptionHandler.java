package com.smart_cafe_ai.engagement_service.exception;
import com.smart_cafe_ai.engagement_service.dto.ApiResponse;
import jakarta.validation.ConstraintViolationException;
import org.springframework.dao.*;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.*;
import java.util.List;
@RestControllerAdvice(assignableTypes = com.smart_cafe_ai.engagement_service.controller.EngagementController.class)
public class ApiExceptionHandler {
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiResponse> api(ApiException ex) { return ResponseEntity.status(ex.status).body(ApiResponse.error(ex.code,ex.getMessage(),List.of())); }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse> validation(MethodArgumentNotValidException ex) { return ResponseEntity.badRequest().body(ApiResponse.error("VALIDATION_ERROR","Dữ liệu không hợp lệ.",ex.getBindingResult().getFieldErrors().stream().map(e->java.util.Map.of("field",e.getField(),"message",String.valueOf(e.getDefaultMessage()))).toList())); }
    @ExceptionHandler({HttpMessageNotReadableException.class,MissingServletRequestParameterException.class,MethodArgumentTypeMismatchException.class,HandlerMethodValidationException.class,ConstraintViolationException.class})
    public ResponseEntity<ApiResponse> invalid(Exception ex) { return ResponseEntity.badRequest().body(ApiResponse.error("VALIDATION_ERROR","JSON, tham số hoặc kiểu dữ liệu không hợp lệ.",List.of())); }
    @ExceptionHandler({OptimisticLockingFailureException.class,PessimisticLockingFailureException.class})
    public ResponseEntity<ApiResponse> locking(Exception ex) { return ResponseEntity.status(409).body(ApiResponse.error("VERSION_CONFLICT","Dữ liệu đã thay đổi; vui lòng thử lại.",List.of())); }
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse> conflict(Exception ex) { return ResponseEntity.status(409).body(ApiResponse.error("CONFLICT","Dữ liệu bị trùng hoặc xung đột ràng buộc.",List.of())); }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse> unexpected(Exception ex) {
        org.slf4j.LoggerFactory.getLogger(getClass()).error("Engagement request failed; trace_id={}",org.slf4j.MDC.get("trace_id"),ex);
        return ResponseEntity.internalServerError().body(ApiResponse.error("INTERNAL_ERROR","Không thể xử lý yêu cầu.",List.of()));
    }
}
