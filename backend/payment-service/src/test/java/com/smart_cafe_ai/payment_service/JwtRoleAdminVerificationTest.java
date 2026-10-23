package com.smart_cafe_ai.payment_service;

import com.smart_cafe_ai.payment_service.security.JwtService;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;

import javax.crypto.SecretKey;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

public class JwtRoleAdminVerificationTest {

    @Test
    public void testTokenFromIdentityServiceWithAdminRole() {
        String secret = "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970";
        SecretKey key = Keys.hmacShaKeyFor(Decoders.BASE64.decode(secret));

        // Giả lập token sinh ra từ Identity Service cho tài khoản ADMIN:
        // claims.put("role", "ADMIN");
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", "ADMIN");
        claims.put("branch_id", 1);

        String token = Jwts.builder()
                .claims(claims)
                .subject("admin_user_01")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 3600000))
                .signWith(key)
                .compact();

        // Test qua JwtService của payment-service:
        JwtService jwtService = new JwtService(secret);

        assertTrue(jwtService.isTokenValid(token), "Token phải hợp lệ");
        assertEquals("admin_user_01", jwtService.extractUserId(token));

        List<String> roles = jwtService.extractRoles(token);
        System.out.println("Extracted Roles from Token: " + roles);
        assertTrue(roles.contains("ADMIN"), "Phải chứa role ADMIN");
    }
}
