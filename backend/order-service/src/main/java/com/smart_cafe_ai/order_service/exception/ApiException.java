package com.smart_cafe_ai.order_service.exception;
import org.springframework.http.HttpStatus;
public class ApiException extends RuntimeException {
    public final HttpStatus status;
    public final String code;
    public ApiException(HttpStatus status,String code,String message){super(message);this.status=status;this.code=code;}
    public static ApiException invalid(String message){return new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_ERROR",message);}
    public static ApiException missing(){return new ApiException(HttpStatus.NOT_FOUND,"NOT_FOUND","Không tìm thấy dữ liệu trong phạm vi truy cập.");}
    public static ApiException forbidden(){return new ApiException(HttpStatus.FORBIDDEN,"FORBIDDEN","Bạn không có quyền thực hiện thao tác này.");}
    public static ApiException conflict(String code,String message){return new ApiException(HttpStatus.CONFLICT,code,message);}
}
