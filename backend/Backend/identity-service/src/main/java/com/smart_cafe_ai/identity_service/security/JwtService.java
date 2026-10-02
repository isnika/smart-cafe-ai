package com.smart_cafe_ai.identity_service.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

@Service
public class JwtService {

    @Value("${jwt.secret:404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970}")
    private String secretKey;

    @Value("${jwt.expiration-ms:900000}") // 15 phút mặc định cho Access Token
    private long accessTokenExpirationMs;

    @Value("${jwt.refresh-expiration-ms:604800000}") // 7 ngày mặc định cho Refresh Token
    private long refreshTokenExpirationMs;

    public String generateAccessToken(String userId, String role, Integer branchId) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", role);
        claims.put("branch_id", branchId);
        return buildToken(claims, userId, accessTokenExpirationMs);
    }

    public String generateRefreshToken(String userId) {
        return buildToken(new HashMap<>(), userId, refreshTokenExpirationMs);
    }

    private String buildToken(Map<String, Object> extraClaims, String subject, long expirationMs) {
        return Jwts.builder()
                .claims(extraClaims)
                .subject(subject)
                .issuedAt(new Date(System.currentTimeMillis()))
                .expiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(getSignInKey())
                .compact();
    }

    public boolean isTokenValid(String token, String userId) {
        final String extractedUserId = extractUserId(token);
        return (extractedUserId.equals(userId)) && !isTokenExpired(token);
    }

    public boolean isTokenValid(String token) {
        try {
            return !isTokenExpired(token);
        } catch (Exception e) {
            return false;
        }
    }

    public String extractUserId(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    public String extractRole(String token) {
        return extractClaim(token, claims -> claims.get("role", String.class));
    }

    public Integer extractBranchId(String token) {
        return extractClaim(token, claims -> claims.get("branch_id", Integer.class));
    }

    public boolean isTokenExpired(String token) {
        return extractExpiration(token).before(new Date());
    }

    private Date extractExpiration(String token) {
        return extractClaim(token, Claims::getExpiration);
    }

    public <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = extractAllClaims(token);
        return claimsResolver.apply(claims);
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parser()
                .verifyWith(getSignInKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private SecretKey getSignInKey() {
        byte[] keyBytes = Decoders.BASE64.decode(secretKey);
        if (keyBytes.length < 32) {
            // Hex string or raw string fallback
            keyBytes = secretKey.getBytes();
        }
        return Keys.hmacShaKeyFor(keyBytes);
    }

    public long getAccessTokenExpirationMs() {
        return accessTokenExpirationMs;
    }
}
