package com.smart_cafe_ai.catalog_service.exception;

import com.smart_cafe_ai.catalog_service.dto.ApiResponse;
import com.smart_cafe_ai.catalog_service.dto.category.CategoryStatusRequest;
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
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataIntegrityViolationException;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleIntegrity(DataIntegrityViolationException ex) {
        for(Throwable cause=ex;cause!=null;cause=cause.getCause()) {
            if(cause instanceof java.sql.SQLException sql && (sql.getErrorCode()==1062 || "23505".equals(sql.getSQLState())))
                return ResponseEntity.status(409).body(ApiResponse.error("DUPLICATE_PRODUCT_CONFIGURATION","Tên biến thể, nhóm tùy chọn hoặc tùy chọn đã tồn tại trong cùng phạm vi. Vui lòng chọn tên khác."));
        }
        log.error("Catalog integrity failure",ex);
        return ResponseEntity.status(409).body(ApiResponse.error("DATA_CONFLICT","Dữ liệu liên kết đã thay đổi hoặc chưa hợp lệ. Vui lòng tải lại và kiểm tra thông tin."));
    }
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiResponse<Void>> handleApi(ApiException ex) {
        return ResponseEntity.status(ex.getStatus()).body(ApiResponse.error(ex.getCode(), ex.getMessage()));
    }

    @ExceptionHandler({MethodArgumentTypeMismatchException.class, MissingServletRequestParameterException.class,
            HandlerMethodValidationException.class})
    public ResponseEntity<ApiResponse<Void>> handleValidation(Exception ex, HttpServletRequest request) {
        String message = "Thông tin gửi lên chưa hợp lệ. Vui lòng kiểm tra và thử lại.";
        if (ex instanceof MethodArgumentTypeMismatchException mismatch) {
            message = parameterMessage(mismatch.getName(), resourceName(request));
        } else if (ex instanceof MissingServletRequestParameterException missing) {
            message = parameterMessage(missing.getParameterName(), resourceName(request));
        } else if (ex instanceof HandlerMethodValidationException validation) {
            message = validation.getAllValidationResults().stream().findFirst()
                    .map(result -> parameterMessage(result.getMethodParameter().getParameterName(), resourceName(request)))
                    .orElse(message);
        }
        String resource = resourceName(request);
        if (!resource.equals("danh mục")) message = message
                .replace("Trạng thái danh mục", "Trạng thái " + resource)
                .replace("trạng thái danh mục", "trạng thái " + resource);
        return ResponseEntity.badRequest().body(ApiResponse.error("VALIDATION_ERROR", message));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleBodyValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getDefaultMessage()).findFirst().orElse("Vui lòng kiểm tra lại thông tin đã nhập.");
        return ResponseEntity.badRequest().body(ApiResponse.error("VALIDATION_ERROR", message));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleJson(HttpMessageNotReadableException ex, HttpServletRequest request) {
        boolean product = !request.getRequestURI().contains("/categories");
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
                if (product) {
                    message = productFieldMessage(field, request.getRequestURI().endsWith("/status"));
                    break;
                }
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
    public ResponseEntity<ApiResponse<Void>> handleConcurrentWrite(PessimisticLockingFailureException ex, HttpServletRequest request) {
        return ResponseEntity.status(409).body(ApiResponse.error("CONCURRENT_MODIFICATION",
                "Dữ liệu liên quan" +
                        " đang được cập nhật bởi yêu cầu khác. Vui lòng thử lại."));
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

    private String parameterMessage(String name, String resource) {
        if (name == null) return "Thông tin gửi lên chưa hợp lệ. Vui lòng kiểm tra lại.";
        return switch (name) {
            case "page" -> "Số trang phải là số nguyên lớn hơn hoặc bằng 1.";
            case "size" -> "Số mục trên mỗi trang phải là số nguyên từ 1 đến 100.";
            case "status" -> "Trạng thái danh mục không hợp lệ. Vui lòng chọn đang hiển thị hoặc ngừng hiển thị.";
            case "id" -> "Mã " + resource + " phải là số nguyên dương.";
            case "category_id", "categoryId" -> "Mã danh mục phải là số nguyên dương.";
            case "branch_id", "branchId" -> "Mã chi nhánh phải là số nguyên dương.";
            case "productId" -> "Mã sản phẩm phải là số nguyên dương.";
            case "variantId" -> "Mã biến thể phải là số nguyên dương.";
            case "optionId" -> "Mã tùy chọn phải là số nguyên dương.";
            case "groupId" -> "Mã nhóm tùy chọn phải là số nguyên dương.";
            case "min_price", "max_price", "minPrice", "maxPrice" -> "Giá phải là số nguyên VND không âm và không vượt quá 15 chữ số.";
            case "temperature" -> "Nhiệt độ phục vụ không hợp lệ. Vui lòng chọn lại.";
            case "caffeine_level", "caffeineLevel" -> "Mức caffeine không hợp lệ. Vui lòng chọn lại.";
            default -> "Thông tin gửi lên chưa hợp lệ. Vui lòng kiểm tra và thử lại.";
        };
    }

    private String productFieldMessage(String field, boolean statusOnly) {
        if (statusOnly && field != null && !field.equals("status"))
            return "Vui lòng chỉ gửi trạng thái sản phẩm cho thao tác này.";
        if (field == null) return "Dữ liệu sản phẩm chưa đúng định dạng JSON. Vui lòng kiểm tra lại.";
        return switch (field) {
            case "category_id" -> "Mã danh mục phải là số nguyên dương.";
            case "branch_id" -> "Mã chi nhánh phải là số nguyên dương.";
            case "variant_id" -> "Mã biến thể phải là số nguyên dương.";
            case "option_id" -> "Mã tùy chọn phải là số nguyên dương.";
            case "quantity" -> "Số lượng tùy chọn phải là số nguyên dương.";
            case "is_available" -> "Trạng thái khả dụng phải là true hoặc false.";
            case "unavailable_reason" -> "Lý do ngừng bán phải là chuỗi văn bản, tối đa 255 ký tự.";
            case "name", "variant_name", "option_name" -> "Tên sản phẩm, biến thể hoặc tùy chọn phải là chuỗi văn bản.";
            case "image" -> "Đường dẫn ảnh phải là chuỗi văn bản. Vui lòng kiểm tra lại.";
            case "description" -> "Mô tả sản phẩm phải là chuỗi văn bản.";
            case "sort_order" -> "Thứ tự hiển thị phải là số nguyên không âm.";
            case "status" -> "Trạng thái sản phẩm hoặc tùy chọn chỉ được là Active hoặc Inactive.";
            case "temperature" -> "Nhiệt độ phải là Hot, Iced, Blended, Hot_Or_Iced hoặc null.";
            case "caffeine_level" -> "Mức caffeine phải là None, Low, Medium hoặc High.";
            case "flavor_tags" -> "Nhãn hương vị phải là một mảng các chuỗi văn bản.";
            case "price", "extra_price" -> "Giá phải là số nguyên VND không âm và không vượt quá 15 chữ số.";
            case "selection_type" -> "Kiểu nhóm tùy chọn phải là Single hoặc Multiple.";
            case "is_required", "is_default" -> "is_required và is_default phải là true hoặc false.";
            case "min_select", "max_select" -> "Số lượng lựa chọn phải là số nguyên trong phạm vi cho phép.";
            case "variants", "option_groups", "options", "items" -> "Danh sách gửi lên phải là mảng JSON không chứa phần tử null.";
            default -> "Thông tin sản phẩm có trường chưa được hỗ trợ. Vui lòng kiểm tra lại các trường gửi lên.";
        };
    }

    private String resourceName(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (path.contains("/categories")) return "danh mục";
        if (path.contains("/variants")) return "biến thể";
        if (path.contains("/option-groups")) return "nhóm tùy chọn";
        if (path.contains("/options")) return "tùy chọn";
        return "sản phẩm";
    }
}

