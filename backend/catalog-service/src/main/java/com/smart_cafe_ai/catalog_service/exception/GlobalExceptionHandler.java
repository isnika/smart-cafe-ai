package com.smart_cafe_ai.catalog_service.exception;

import com.smart_cafe_ai.catalog_service.dto.ApiResponse;
import com.smart_cafe_ai.catalog_service.dto.category.CategoryStatusRequest;
import com.smart_cafe_ai.catalog_service.controller.CategoryAdminController;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.exc.InvalidNullException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.web.HttpMediaTypeNotSupportedException;

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
        String message = "Thông tin gửi lên chưa hợp lệ. Vui lòng kiểm tra và thử lại.";
        if (ex instanceof MethodArgumentTypeMismatchException mismatch) {
            message = parameterMessage(mismatch.getName(),
                    mismatch.getParameter().getContainingClass() == CategoryAdminController.class);
        } else if (ex instanceof MissingServletRequestParameterException missing) {
            message = parameterMessage(missing.getParameterName(), false);
        } else if (ex instanceof HandlerMethodValidationException validation) {
            message = validation.getAllValidationResults().stream().findFirst()
                    .map(result -> parameterMessage(result.getMethodParameter().getParameterName(),
                            validation.getMethod().getDeclaringClass() == CategoryAdminController.class))
                    .orElse(message);
        }
        return ResponseEntity.badRequest().body(ApiResponse.error("VALIDATION_ERROR", message));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleBodyValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getDefaultMessage()).findFirst().orElse("Vui lòng kiểm tra lại thông tin đã nhập.");
        return ResponseEntity.badRequest().body(ApiResponse.error("VALIDATION_ERROR", message));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleJson(HttpMessageNotReadableException ex) {
        String message = "Dữ liệu gửi lên chưa đúng định dạng. Vui lòng kiểm tra và thử lại.";
        if (ex.getCause() == null) message = "Vui lòng nhập thông tin trước khi gửi yêu cầu.";
        for (Throwable cause = ex.getCause(); cause != null; cause = cause.getCause()) {
            if (cause instanceof JsonMappingException mapping) {
                String field = mapping.getPath().isEmpty() ? null
                        : mapping.getPath().get(mapping.getPath().size() - 1).getFieldName();
                if (mapping instanceof InvalidNullException invalidNull && invalidNull.getPropertyName() != null)
                    field = invalidNull.getPropertyName().getSimpleName();
                boolean statusOnly = mapping.getPath().stream().anyMatch(reference ->
                        reference.getFrom() instanceof CategoryStatusRequest || reference.getFrom() == CategoryStatusRequest.class);
                if (statusOnly && field != null && !field.equals("status"))
                    message = "Vui lòng chỉ gửi trạng thái danh mục cho thao tác này.";
                else if (field != null) message = switch (field) {
                    case "name" -> "Tên danh mục phải là chuỗi văn bản. Vui lòng nhập lại.";
                    case "image" -> "Đường dẫn ảnh phải là chuỗi văn bản. Vui lòng kiểm tra lại.";
                    case "sort_order" -> "Thứ tự hiển thị phải là số nguyên không âm.";
                    case "status" -> "Trạng thái danh mục không hợp lệ. Vui lòng chọn đang hiển thị hoặc ngừng hiển thị.";
                    default -> "Thông tin danh mục có trường chưa được hỗ trợ. Vui lòng kiểm tra lại các trường gửi lên.";
                };
                break;
            }
        }
        return ResponseEntity.badRequest().body(ApiResponse.error("VALIDATION_ERROR", message));
    }

    @ExceptionHandler(PessimisticLockingFailureException.class)
    public ResponseEntity<ApiResponse<Void>> handleConcurrentWrite(PessimisticLockingFailureException ex) {
        return ResponseEntity.status(409).body(ApiResponse.error("CONCURRENT_MODIFICATION",
                "Danh mục đang được cập nhật bởi yêu cầu khác. Vui lòng thử lại."));
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiResponse<Void>> handleContentType(HttpMediaTypeNotSupportedException ex) {
        return ResponseEntity.status(415).body(ApiResponse.error("UNSUPPORTED_MEDIA_TYPE",
                "Vui lòng gửi dữ liệu dạng JSON với Content-Type: application/json."));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotFound(NoResourceFoundException ex) {
        return ResponseEntity.status(404).body(ApiResponse.error("NOT_FOUND",
                "Không tìm thấy địa chỉ bạn yêu cầu. Vui lòng kiểm tra lại đường dẫn."));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiResponse<Void>> handleMethod(HttpRequestMethodNotSupportedException ex) {
        return ResponseEntity.status(405).body(ApiResponse.error("METHOD_NOT_ALLOWED",
                "Phương thức gửi yêu cầu không được hỗ trợ tại địa chỉ này."));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpected(Exception ex) {
        ApiResponse<Void> body = ApiResponse.error("INTERNAL_SERVER_ERROR", "Hệ thống đang gặp sự cố. Vui lòng thử lại sau.");
        log.error("Catalog request failed, trace_id={}", body.traceId(), ex);
        return ResponseEntity.internalServerError().body(body);
    }

    private String parameterMessage(String name, boolean categoryId) {
        if (name == null) return "Thông tin gửi lên chưa hợp lệ. Vui lòng kiểm tra lại.";
        return switch (name) {
            case "page" -> "Số trang phải là số nguyên lớn hơn hoặc bằng 1.";
            case "size" -> "Số mục trên mỗi trang phải là số nguyên từ 1 đến 100.";
            case "status" -> "Trạng thái danh mục không hợp lệ. Vui lòng chọn đang hiển thị hoặc ngừng hiển thị.";
            case "id" -> categoryId ? "Mã danh mục phải là số nguyên dương." : "Mã sản phẩm phải là số nguyên dương.";
            case "category_id", "categoryId" -> "Mã danh mục phải là số nguyên dương.";
            case "branch_id", "branchId" -> "Mã chi nhánh phải là số nguyên dương.";
            case "min_price", "max_price", "minPrice", "maxPrice" -> "Giá phải là số nguyên VND không âm và không vượt quá 15 chữ số.";
            case "temperature" -> "Nhiệt độ phục vụ không hợp lệ. Vui lòng chọn lại.";
            case "caffeine_level", "caffeineLevel" -> "Mức caffeine không hợp lệ. Vui lòng chọn lại.";
            default -> "Thông tin gửi lên chưa hợp lệ. Vui lòng kiểm tra và thử lại.";
        };
    }
}

