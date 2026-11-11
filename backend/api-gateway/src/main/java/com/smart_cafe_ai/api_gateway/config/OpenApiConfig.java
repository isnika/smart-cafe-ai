package com.smart_cafe_ai.api_gateway.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Smart Cafe AI - API Gateway")
                        .version("1.0.0")
                        .description("Tập trung toàn bộ tài liệu Swagger / OpenAPI của hệ thống microservices Smart Cafe AI")
                        .contact(new Contact().name("Smart Cafe AI Team")));
    }
}
