package com.smart_cafe_ai.identity_service.config;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class GoogleAuthConfig {
    @Bean
    public GoogleIdTokenVerifier googleIdTokenVerifier(
            @Value("${auth.google.client-id:}") String clientId) {
        return new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), GsonFactory.getDefaultInstance())
                .setAudience(List.of(clientId.trim()))
                .setAcceptableTimeSkewSeconds(30)
                .build();
    }
}
