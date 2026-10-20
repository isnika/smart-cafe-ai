package com.smart_cafe_ai.store_service.security;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // Allow CORS pre-flight requests
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                // Actuator endpoints
                .requestMatchers("/actuator/**").permitAll()

                // Internal APIs (chỉ dùng giao tiếp nội bộ giữa các microservices)
                .requestMatchers("/internal/**", "/api/v1/internal/**").permitAll()

                // Public APIs (Guest/Khách hàng xem thông tin chi nhánh & quét QR)
                .requestMatchers(HttpMethod.GET, "/branches", "/branches/*", "/api/v1/branches", "/api/v1/branches/*").permitAll()
                .requestMatchers("/qr/**", "/api/v1/qr/**", "/api/qr/**").permitAll()
                .requestMatchers("/table-sessions/current/**", "/api/v1/table-sessions/current/**").permitAll()

                // Các API còn lại được kiểm soát phân quyền qua @PreAuthorize tại Controller
                .anyRequest().permitAll()
            )
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
