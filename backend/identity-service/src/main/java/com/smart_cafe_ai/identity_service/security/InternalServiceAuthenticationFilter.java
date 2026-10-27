package com.smart_cafe_ai.identity_service.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.identity_service.dto.ApiResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;

/** Service credentials are independent of an end user's access token. */
public class InternalServiceAuthenticationFilter extends OncePerRequestFilter {
    private final String secret;
    private final ObjectMapper json;

    public InternalServiceAuthenticationFilter(String secret, ObjectMapper json) {
        this.secret = secret;
        this.json = json;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        if (path.isEmpty()) path = request.getRequestURI();
        return Arrays.stream(path.split("/"))
                .noneMatch(segment -> segment.split(";", 2)[0].equalsIgnoreCase("internal"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String provided = request.getHeader("X-Service-Key");
        if (provided == null || provided.isBlank()) {
            error(response, 401, "UNAUTHORIZED", "Thiếu thông tin xác thực service nội bộ.");
        } else if (secret.isBlank()) {
            error(response, 503, "INTERNAL_AUTH_NOT_CONFIGURED", "Identity chưa được cấu hình khóa giao tiếp nội bộ.");
        } else if (!MessageDigest.isEqual(secret.getBytes(StandardCharsets.UTF_8), provided.getBytes(StandardCharsets.UTF_8))) {
            error(response, 403, "FORBIDDEN", "Service không có quyền gọi API nội bộ Identity.");
        } else {
            chain.doFilter(request, response);
        }
    }

    private void error(HttpServletResponse response, int status, String code, String message) throws IOException {
        response.setStatus(status);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        json.writeValue(response.getWriter(), ApiResponse.error(code, message));
    }
}
