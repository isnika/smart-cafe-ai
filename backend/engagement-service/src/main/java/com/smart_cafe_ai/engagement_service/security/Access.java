package com.smart_cafe_ai.engagement_service.security;
import com.smart_cafe_ai.engagement_service.exception.ApiException;
import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import static org.springframework.http.HttpStatus.*;
@Component
public class Access {
    public record Actor(String userId,String role,Integer branchId) { }
    private final SecretKey key;
    private final String internalKey;
    public Access(@Value("${jwt.secret}") String secret,@Value("${app.engagement.internal-api-key:}") String internalKey) {
        if(secret.isBlank()) key=null;
        else { byte[] bytes=Decoders.BASE64.decode(secret); key=Keys.hmacShaKeyFor(bytes.length<32?secret.getBytes(StandardCharsets.UTF_8):bytes); }
        this.internalKey=internalKey;
    }
    private Actor actor(HttpServletRequest request) {
        String header=request.getHeader("Authorization");
        if(header==null||!header.startsWith("Bearer ")) throw new ApiException(UNAUTHORIZED,"UNAUTHORIZED","Vui lòng đăng nhập.");
        if(key==null) throw new ApiException(SERVICE_UNAVAILABLE,"JWT_AUTH_NOT_CONFIGURED","Chưa cấu hình JWT_SECRET khớp với Identity.");
        try {
            Claims c=Jwts.parser().verifyWith(key).build().parseSignedClaims(header.substring(7)).getPayload();
            String sub=c.getSubject(),role=c.get("role",String.class);
            if(c.getExpiration()==null||sub==null||sub.isBlank()||sub.length()>36||role==null) throw new IllegalArgumentException();
            return new Actor(sub,role,c.get("branch_id",Integer.class));
        } catch(ExpiredJwtException ex) { throw new ApiException(UNAUTHORIZED,"TOKEN_EXPIRED","Phiên đăng nhập đã hết hạn."); }
        catch(JwtException|IllegalArgumentException ex) { throw new ApiException(UNAUTHORIZED,"UNAUTHORIZED","Token không hợp lệ."); }
    }
    public Actor customer(HttpServletRequest request) { Actor a=actor(request); if(!"Customer".equals(a.role())) throw ApiException.forbidden(); return a; }
    public Actor manager(HttpServletRequest request) { Actor a=actor(request); if(!"Manager".equals(a.role())&&!"Admin".equals(a.role())) throw ApiException.forbidden(); return a; }
    public void internal(HttpServletRequest request) {
        String supplied=request.getHeader("X-Service-Key");
        if(supplied==null||supplied.isBlank()) throw new ApiException(UNAUTHORIZED,"UNAUTHORIZED","Thiếu X-Service-Key.");
        if(internalKey.isBlank()) throw new ApiException(SERVICE_UNAVAILABLE,"INTERNAL_AUTH_NOT_CONFIGURED","Chưa cấu hình ENGAGEMENT_INTERNAL_API_KEY.");
        if(!MessageDigest.isEqual(internalKey.getBytes(StandardCharsets.UTF_8),supplied.getBytes(StandardCharsets.UTF_8))) throw ApiException.forbidden();
    }
}
