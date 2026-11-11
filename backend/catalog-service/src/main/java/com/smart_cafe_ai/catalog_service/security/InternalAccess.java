package com.smart_cafe_ai.catalog_service.security;
import com.smart_cafe_ai.catalog_service.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import static org.springframework.http.HttpStatus.*;
@Component
public class InternalAccess {
    private final String secret;
    public InternalAccess(@Value("${app.internal-api-key:}") String secret){this.secret=secret;}
    public void require(String provided) {
        if(provided==null || provided.isBlank()) throw new ApiException(UNAUTHORIZED,"UNAUTHORIZED","Thiếu thông tin xác thực service nội bộ.");
        if(secret.isBlank()) throw new ApiException(SERVICE_UNAVAILABLE,"INTERNAL_AUTH_NOT_CONFIGURED","Catalog chưa được cấu hình khóa giao tiếp nội bộ.");
        if(!MessageDigest.isEqual(secret.getBytes(StandardCharsets.UTF_8),provided.getBytes(StandardCharsets.UTF_8)))
            throw new ApiException(FORBIDDEN,"FORBIDDEN","Service không có quyền gọi API nội bộ Catalog.");
    }
}
