package com.smart_cafe_ai.order_service.security;

import com.smart_cafe_ai.order_service.exception.ApiException;
import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Set;
import static org.springframework.http.HttpStatus.*;

@Component
public class Access {
    public record Actor(String userId,String role) {
        public boolean staff(){return Set.of("Staff","Manager","Admin").contains(role);}
        public boolean admin(){return "Admin".equals(role);}
        public boolean manager(){return "Manager".equals(role)||admin();}
    }
    public record Context(Actor actor,String sessionCode,String clientKey) {}
    private final SecretKey key;
    private final String internalKey;
    public Access(@Value("${jwt.secret}") String secret,@Value("${app.internal-api-key:}") String internalKey){
        byte[] bytes=Decoders.BASE64.decode(secret);key=Keys.hmacShaKeyFor(bytes.length<32?secret.getBytes(StandardCharsets.UTF_8):bytes);this.internalKey=internalKey;
    }
    public Context context(HttpServletRequest req){return new Context(optional(req.getHeader("Authorization")),req.getHeader("X-Table-Session-Code"),req.getHeader("X-Client-Key"));}
    public Actor optional(String header){
        if(header==null)return null;
        try {
            if(!header.startsWith("Bearer "))throw new IllegalArgumentException();
            var c=Jwts.parser().verifyWith(key).build().parseSignedClaims(header.substring(7)).getPayload();
            String sub=c.getSubject(),role=c.get("role",String.class);
            if(c.getExpiration()==null||sub==null||sub.isBlank()||sub.length()>36||role==null)throw new IllegalArgumentException();
            return new Actor(sub,role);
        }catch(ExpiredJwtException ex){throw new ApiException(UNAUTHORIZED,"TOKEN_EXPIRED","Phiên đăng nhập đã hết hạn.");}
        catch(JwtException|IllegalArgumentException ex){throw new ApiException(UNAUTHORIZED,"UNAUTHORIZED","Token không hợp lệ.");}
    }
    public Actor require(Context context){if(context.actor()==null)throw new ApiException(UNAUTHORIZED,"UNAUTHORIZED","Vui lòng đăng nhập.");return context.actor();}
    public Actor customer(Context context){var a=require(context);if(!"Customer".equals(a.role()))throw ApiException.forbidden();return a;}
    public Actor staff(Context context){var a=require(context);if(!a.staff())throw ApiException.forbidden();return a;}
    public Actor manager(Context context){var a=require(context);if(!a.manager())throw ApiException.forbidden();return a;}
    public String client(Context c){if(c.clientKey()==null||c.clientKey().isBlank()||c.clientKey().length()>64)throw ApiException.invalid("QR cần X-Client-Key dài 1–64 ký tự.");return c.clientKey();}
    public void internal(String supplied){
        if(supplied==null||supplied.isBlank())throw new ApiException(UNAUTHORIZED,"UNAUTHORIZED","Thiếu X-Service-Key.");
        if(internalKey.isBlank())throw new ApiException(SERVICE_UNAVAILABLE,"INTERNAL_AUTH_NOT_CONFIGURED","Chưa cấu hình ORDER_INTERNAL_API_KEY.");
        if(!MessageDigest.isEqual(internalKey.getBytes(StandardCharsets.UTF_8),supplied.getBytes(StandardCharsets.UTF_8)))throw ApiException.forbidden();
    }
}
