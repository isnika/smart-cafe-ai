package com.smart_cafe_ai.identity_service.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.googleapis.auth.oauth2.GooglePublicKeysManager;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.smart_cafe_ai.identity_service.config.GoogleAuthConfig;
import com.smart_cafe_ai.identity_service.exception.GoogleAuthException;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.IOException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.time.Instant;
import java.util.Date;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class GoogleTokenVerifierServiceTest {
    private static final String CLIENT_ID = "test-client.apps.googleusercontent.com";
    private KeyPair keyPair;
    private GooglePublicKeysManager keys;
    private GoogleTokenVerifierService service;

    @BeforeEach
    void setUp() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        keyPair = generator.generateKeyPair();
        keys = new GooglePublicKeysManager(new NetHttpTransport(), GsonFactory.getDefaultInstance());
        ReflectionTestUtils.setField(keys, "publicKeys", List.of(keyPair.getPublic()));
        ReflectionTestUtils.setField(keys, "expirationTimeMilliseconds", System.currentTimeMillis() + 3600000);
        GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(keys)
                .setAudience(List.of(CLIENT_ID)).setAcceptableTimeSkewSeconds(30).build();
        service = new GoogleTokenVerifierService(verifier, CLIENT_ID);
    }

    @Test
    void verifiesRealRsaSignatureAndReturnsGoogleSubject() {
        var identity = service.verify(token("https://accounts.google.com", CLIENT_ID, 600));
        assertEquals("google-123", identity.subject());
        assertEquals("customer@gmail.com", identity.email());
        assertTrue(identity.hasAuthoritativeEmail());
    }

    @Test
    void acceptsLegacyGoogleIssuer() {
        assertEquals("google-123", service.verify(token("accounts.google.com", CLIENT_ID, 600)).subject());
    }

    @Test
    void rejectsWrongAudience() {
        assertInvalid(token("https://accounts.google.com", "other-client", 600));
    }

    @Test
    void rejectsWrongIssuer() {
        assertInvalid(token("https://attacker.example", CLIENT_ID, 600));
    }

    @Test
    void rejectsExpiredToken() {
        assertInvalid(token("https://accounts.google.com", CLIENT_ID, -600));
    }

    @Test
    void rejectsUntrustedSignature() throws Exception {
        ReflectionTestUtils.setField(keys, "publicKeys",
                List.of(KeyPairGenerator.getInstance("RSA").generateKeyPair().getPublic()));
        assertInvalid(token("https://accounts.google.com", CLIENT_ID, 600));
    }

    @Test
    void rejectsMissingRequiredClaims() {
        String missingSubject = Jwts.builder().issuer("https://accounts.google.com")
                .audience().add(CLIENT_ID).and().issuedAt(new Date())
                .expiration(Date.from(Instant.now().plusSeconds(600)))
                .signWith(keyPair.getPrivate(), Jwts.SIG.RS256).compact();
        assertInvalid(missingSubject);
    }

    @Test
    void rejectsMalformedToken() {
        assertInvalid("not-a-jwt");
    }

    @Test
    void unavailableGoogleKeysAreServiceUnavailable() throws Exception {
        GooglePublicKeysManager unavailableKeys = new GooglePublicKeysManager(
                new NetHttpTransport(), GsonFactory.getDefaultInstance()) {
            @Override
            public GooglePublicKeysManager refresh() throws IOException {
                throw new IOException("network unavailable");
            }
        };
        service = new GoogleTokenVerifierService(new GoogleIdTokenVerifier.Builder(unavailableKeys)
                .setAudience(List.of(CLIENT_ID)).build(), CLIENT_ID);
        GoogleAuthException error = assertThrows(GoogleAuthException.class,
                () -> service.verify(token("https://accounts.google.com", CLIENT_ID, 600)));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, error.getStatus());
        assertEquals("GOOGLE_AUTH_UNAVAILABLE", error.getCode());
    }

    @Test
    void emptyConfigurationFailsClosed() {
        var unconfigured = new GoogleTokenVerifierService(new GoogleAuthConfig().googleIdTokenVerifier(""), "");
        var error = assertThrows(GoogleAuthException.class, () -> unconfigured.verify("some-token"));
        assertEquals("GOOGLE_AUTH_NOT_CONFIGURED", error.getCode());
    }

    @Test
    void productionConfigurationPinsAudience() {
        assertEquals(List.of(CLIENT_ID), List.copyOf(new GoogleAuthConfig().googleIdTokenVerifier(CLIENT_ID).getAudience()));
    }

    @Test
    void rejectsMissingExpirationWithoutServerError() {
        String token = Jwts.builder().issuer("https://accounts.google.com").subject("google-123")
                .audience().add(CLIENT_ID).and().issuedAt(new Date())
                .signWith(keyPair.getPrivate(), Jwts.SIG.RS256).compact();
        assertInvalid(token);
    }

    @Test
    void rejectsFutureIssuedAt() {
        String token = Jwts.builder().issuer("https://accounts.google.com").subject("google-123")
                .audience().add(CLIENT_ID).and().issuedAt(Date.from(Instant.now().plusSeconds(600)))
                .expiration(Date.from(Instant.now().plusSeconds(1200)))
                .signWith(keyPair.getPrivate(), Jwts.SIG.RS256).compact();
        assertInvalid(token);
    }

    private String token(String issuer, String audience, long expiresInSeconds) {
        return Jwts.builder().issuer(issuer).audience().add(audience).and()
                .subject("google-123").issuedAt(Date.from(Instant.now().minusSeconds(1200)))
                .expiration(Date.from(Instant.now().plusSeconds(expiresInSeconds)))
                .claim("email", "customer@gmail.com").claim("email_verified", true)
                .claim("name", "Customer").signWith(keyPair.getPrivate(), Jwts.SIG.RS256).compact();
    }

    private void assertInvalid(String token) {
        GoogleAuthException error = assertThrows(GoogleAuthException.class, () -> service.verify(token));
        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatus());
        assertEquals("GOOGLE_TOKEN_INVALID", error.getCode());
    }
}
