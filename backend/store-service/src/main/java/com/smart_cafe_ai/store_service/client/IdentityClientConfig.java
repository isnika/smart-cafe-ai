package com.smart_cafe_ai.store_service.client;

import feign.RequestInterceptor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;

/** Credentials for identity's internal endpoints, scoped to this Feign client. */
public class IdentityClientConfig {
    @Bean
    RequestInterceptor identityServiceKey(@Value("${IDENTITY_INTERNAL_API_KEY:smart-cafe-internal-identity-key}") String key) {
        return template -> template.header("X-Service-Key", key);
    }
}
