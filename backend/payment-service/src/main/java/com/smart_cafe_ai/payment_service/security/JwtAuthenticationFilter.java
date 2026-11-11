package com.smart_cafe_ai.payment_service.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");

        if (StringUtils.hasText(authHeader) && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7).trim();

            if (jwtService.isTokenValid(token)) {
                String userId = jwtService.extractUserId(token);
                List<String> rawRoles = jwtService.extractRoles(token);

                Set<String> authoritySet = new HashSet<>();
                for (String r : rawRoles) {
                    if (r == null || r.isBlank()) continue;
                    String upper = r.toUpperCase().trim();
                    if (upper.startsWith("ROLE_")) {
                        authoritySet.add(upper);
                        authoritySet.add(upper.substring(5)); // thêm cả "ADMIN"
                    } else {
                        authoritySet.add(upper);              // thêm "ADMIN"
                        authoritySet.add("ROLE_" + upper);     // thêm "ROLE_ADMIN"
                    }
                }

                List<SimpleGrantedAuthority> authorities = authoritySet.stream()
                        .map(SimpleGrantedAuthority::new)
                        .collect(Collectors.toList());

                UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                        userId,
                        token,
                        authorities
                );
                authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

                SecurityContextHolder.getContext().setAuthentication(authToken);
                log.debug("Authenticated userId={}, authorities={}", userId, authoritySet);
            } else {
                log.warn("Invalid JWT token received for request to {}", request.getRequestURI());
            }
        }

        filterChain.doFilter(request, response);
    }
}
