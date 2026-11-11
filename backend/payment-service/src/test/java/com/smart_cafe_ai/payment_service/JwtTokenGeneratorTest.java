package com.smart_cafe_ai.payment_service;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.List;

public class JwtTokenGeneratorTest {

    @Test
    public void generateTestToken() {
        String secret = "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970";
        SecretKey key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));

        String token = Jwts.builder()
                .subject("staff_001")
                .claim("user_id", "staff_001")
                .claim("roles", List.of("ROLE_STAFF", "ROLE_CASHIER", "ROLE_MANAGER", "ROLE_ADMIN"))
                .claim("branch_id", 1)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 1000L * 60 * 60 * 24 * 365)) // 1 year
                .signWith(key)
                .compact();

        System.out.println("=================================================");
        System.out.println("GENERATED_TEST_TOKEN: " + token);
        System.out.println("=================================================");
    }
}
