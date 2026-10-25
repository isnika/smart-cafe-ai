package com.smart_cafe_ai.catalog_service.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.*;

@Configuration
@RequiredArgsConstructor
public class CatalogAuthorizationConfig implements WebMvcConfigurer {
    private final CatalogAccess access;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            @Override
            public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
                if (handler instanceof HandlerMethod method &&
                        (method.hasMethodAnnotation(ManagerOnly.class) ||
                         method.getBeanType().isAnnotationPresent(ManagerOnly.class))) {
                    // Authenticate before request-body conversion and validation.
                    String userId = access.requireManager(request.getHeader("Authorization"));
                    request.setAttribute(CatalogActor.ATTRIBUTE, new CatalogActor(userId, request.getRemoteAddr()));
                }
                return true;
            }
        });
    }
}

