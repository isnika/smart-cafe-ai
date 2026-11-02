package com.smart_cafe_ai.payment_service.security;

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

                // Public Callbacks & Webhook IPN từ VNPay & Momo
                .requestMatchers(HttpMethod.GET, "/payments/vnpay/return", "/api/v1/payments/vnpay/return").permitAll()
                .requestMatchers(HttpMethod.GET, "/payments/vnpay/ipn", "/api/v1/payments/vnpay/ipn").permitAll()
                .requestMatchers(HttpMethod.POST, "/payments/momo/ipn", "/api/v1/payments/momo/ipn").permitAll()

                // Public PDF hóa đơn
                .requestMatchers(HttpMethod.GET, "/invoices/*/pdf", "/api/v1/invoices/*/pdf").permitAll()

                // Tất cả request còn lại được xử lý xác thực và kiểm tra bằng @PreAuthorize
                .anyRequest().permitAll()
            )
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
