package com.smart_cafe_ai.payment_service.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Smart Cafe AI - Payment Service API")
                        .version("1.0.0")
                        .description("Tài liệu API cho Payment Service (Thanh toán VNPay, MoMo, Tiền mặt, Hóa đơn, Ca thu ngân, Hoàn tiền)")
                        .contact(new Contact().name("Smart Cafe AI Team")))
                .servers(List.of(
                        new Server().url("/").description("Default Server URL")
                ))
                .addSecurityItem(new SecurityRequirement().addList("Bearer Authentication"))
                .components(new Components()
                        .addSecuritySchemes("Bearer Authentication", new SecurityScheme()
                                .name("Bearer Authentication")
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("Nhập Bearer Token (không cần tiền tố 'Bearer ')")));
    }
}
