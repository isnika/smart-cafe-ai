package com.smart_cafe_ai.catalog_service.security;

import com.smart_cafe_ai.catalog_service.exception.ApiException;
import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;

@Component
public class CatalogAccess {
    private final SecretKey key;

    public CatalogAccess(@Value("${jwt.secret}") String secret) {
        byte[] bytes = Decoders.BASE64.decode(secret);
        key = Keys.hmacShaKeyFor(bytes.length < 32 ? secret.getBytes(StandardCharsets.UTF_8) : bytes);
    }

    // Invoked only for status=Inactive. Active menu browsing remains public.
    public void requireManager(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Cần đăng nhập để xem danh mục Inactive");
        }
        Claims claims;
        try {
            claims = Jwts.parser().verifyWith(key).build()
                    .parseSignedClaims(authorization.substring(7)).getPayload();
            if (claims.getExpiration() == null || claims.getSubject() == null || claims.getSubject().isBlank()) {
                throw new IllegalArgumentException("Access token requires subject and expiration");
            }
        } catch (ExpiredJwtException ex) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "TOKEN_EXPIRED", "Token đã hết hạn");
        } catch (JwtException | IllegalArgumentException ex) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Token không hợp lệ");
        }
        Object role = claims.get("role");
        if (!"Manager".equals(role) && !"Admin".equals(role)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Chỉ Manager hoặc Admin được xem danh mục Inactive");
        }
    }
}

