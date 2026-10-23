package com.smart_cafe_ai.payment_service.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class JwtService {

    private SecretKey base64Key;
    private final SecretKey utf8Key;

    public JwtService(@Value("${jwt.secret:404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970}") String secret) {
        try {
            byte[] keyBytes = Decoders.BASE64.decode(secret);
            if (keyBytes.length >= 32) {
                this.base64Key = Keys.hmacShaKeyFor(keyBytes);
            }
        } catch (Exception e) {
            log.debug("Secret is not Base64 encoded or decode failed: {}", e.getMessage());
        }
        this.utf8Key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public Claims extractAllClaims(String token) {
        // 1. Thử giải mã với Base64 key (chuẩn của identity-service và store-service)
        if (base64Key != null) {
            try {
                return Jwts.parser()
                        .verifyWith(base64Key)
                        .build()
                        .parseSignedClaims(token)
                        .getPayload();
            } catch (JwtException ignored) {}
        }

        // 2. Fallback thử giải mã với UTF-8 raw key
        return Jwts.parser()
                .verifyWith(utf8Key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public String extractUserId(String token) {
        Claims claims = extractAllClaims(token);
        String sub = claims.getSubject();
        if (sub != null && !sub.isBlank()) {
            return sub;
        }
        Object userId = claims.get("user_id");
        return userId != null ? userId.toString() : null;
    }

    @SuppressWarnings("unchecked")
    public List<String> extractRoles(String token) {
        Claims claims = extractAllClaims(token);
        List<String> result = new ArrayList<>();

        // 1. Claim "roles" dạng List
        Object rolesObj = claims.get("roles");
        if (rolesObj instanceof List<?>) {
            for (Object item : (List<?>) rolesObj) {
                if (item instanceof String) {
                    result.add((String) item);
                } else if (item instanceof Map<?, ?>) {
                    Object auth = ((Map<?, ?>) item).get("authority");
                    if (auth != null) result.add(auth.toString());
                }
            }
        }

        // 2. Claim "role" dạng chuỗi đơn (như identity-service sinh ra)
        Object roleObj = claims.get("role");
        if (roleObj != null && !roleObj.toString().isBlank()) {
            result.add(roleObj.toString());
        }

        // 3. Claim "authorities"
        Object authObj = claims.get("authorities");
        if (authObj instanceof List<?>) {
            for (Object item : (List<?>) authObj) {
                if (item instanceof String) {
                    result.add((String) item);
                } else if (item instanceof Map<?, ?>) {
                    Object auth = ((Map<?, ?>) item).get("authority");
                    if (auth != null) result.add(auth.toString());
                }
            }
        }

        return result;
    }

    public Integer extractBranchId(String token) {
        try {
            Claims claims = extractAllClaims(token);
            Object branchId = claims.get("branch_id");
            if (branchId instanceof Number) {
                return ((Number) branchId).intValue();
            }
            if (branchId instanceof String) {
                return Integer.parseInt((String) branchId);
            }
        } catch (Exception ignored) {}
        return null;
    }

    public boolean isTokenValid(String token) {
        try {
            Claims claims = extractAllClaims(token);
            return !claims.getExpiration().before(new Date());
        } catch (Exception e) {
            log.warn("Invalid JWT token: {}", e.getMessage());
            return false;
        }
    }
}
