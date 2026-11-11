package com.smart_cafe_ai.api_gateway;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.api_gateway.filter.CatalogGatewayFilter;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import java.util.*;
class CatalogGatewayFilterTest {
    private static final String SECRET="404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970";
    private final WebTestClient client=WebTestClient.bindToWebHandler(exchange->exchange.getResponse().setComplete())
            .webFilter(new CatalogGatewayFilter(SECRET,new ObjectMapper())).build();
    private String token(String role){return "Bearer "+Jwts.builder().subject("user").claim("role",role).expiration(new Date(System.currentTimeMillis()+60000))
            .signWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode(SECRET))).compact();}
    @ParameterizedTest @ValueSource(strings={"/internal/catalog/resolve","/api/v1/internal/catalog/resolve","/catalog-service/api/v1/internal/catalog/resolve",
            "/identity-service/internal/users/1","/api/v1/%69nternal/catalog/resolve","/api/v1/internal;ignored/catalog/resolve"})
    void blocksInternalRoutesIncludingDiscoveryAliases(String path){client.post().uri(path).header("X-Service-Key","some-key").exchange().expectStatus().isNotFound();}
    @Test void publicMenuIsAccessibleButManagementNeedsVerifiedManagerJwt(){
        client.get().uri("/api/v1/catalog/products").exchange().expectStatus().isOk();
        client.get().uri("/api/v1/catalog/admin/products").exchange().expectStatus().isUnauthorized();
        client.get().uri("/api/v1/catalog/categories?status=Inactive").exchange().expectStatus().isUnauthorized();
        client.post().uri("/api/v1/catalog/products").header("Authorization",token("Customer")).exchange().expectStatus().isForbidden();
        client.post().uri("/api/v1/catalog/products").header("Authorization",token("Manager")).exchange().expectStatus().isOk();
        client.post().uri("/api/v1/catalog/products").header("Authorization","Bearer invalid").exchange().expectStatus().isUnauthorized();
    }
    @Test void propagatesValidatedTraceId(){client.get().uri("/api/v1/catalog/products").header("X-Trace-Id","c4c809f0-b29b-4cce-83c5-247e4e577632").exchange()
            .expectHeader().valueEquals("X-Trace-Id","c4c809f0-b29b-4cce-83c5-247e4e577632");}
}
