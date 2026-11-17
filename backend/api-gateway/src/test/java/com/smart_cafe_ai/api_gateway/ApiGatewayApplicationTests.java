package com.smart_cafe_ai.api_gateway;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.web.cors.CorsConfiguration;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties={"eureka.client.enabled=false","spring.cloud.discovery.enabled=false",
        "spring.cloud.gateway.discovery.locator.enabled=false"})
class ApiGatewayApplicationTests {
    @Autowired
    Environment environment;

    @Autowired
    ApplicationContext applicationContext;

    @Test
    void contextLoads() {
    }

    @Test
    void corsAllowsFrontendOriginsAndApiGatewayMethods() {
        assertThat(environment.getProperty("spring.cloud.gateway.globalcors.add-to-simple-url-handler-mapping", Boolean.class)).isTrue();
        Map<String, CorsConfiguration> configurations = Binder.get(environment)
                .bind("spring.cloud.gateway.globalcors.cors-configurations",
                        Bindable.mapOf(String.class, CorsConfiguration.class))
                .orElseThrow(() -> new AssertionError("CORS configuration is missing"));
        CorsConfiguration cors = configurations.get("/**");
        assertThat(cors).isNotNull();
        assertThat(cors.getAllowedOrigins())
                .contains("http://localhost:5173", "http://127.0.0.1:5173");
        assertThat(cors.getAllowedMethods())
                .contains("GET", "POST", "OPTIONS");
        assertThat(cors.getAllowedHeaders())
                .contains("Authorization", "Content-Type");
    }

    @Test
    void corsPreflightFromViteOriginIsAllowed() {
        WebTestClient.bindToApplicationContext(applicationContext)
                .configureClient().baseUrl("http://localhost").build()
                .options()
                .uri("/catalog/categories")
                .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                .exchange()
                .expectStatus().isOk()
                .expectHeader().valueEquals(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173");
    }
}
