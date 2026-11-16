package com.smart_cafe_ai.identity_service.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.smart_cafe_ai.identity_service.exception.GoogleAuthException;
import com.smart_cafe_ai.identity_service.security.GoogleIdentity;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.security.GeneralSecurityException;

@Service
public class GoogleTokenVerifierService {
    private final GoogleIdTokenVerifier verifier;
    private final String clientId;

    public GoogleTokenVerifierService(GoogleIdTokenVerifier verifier,
                                     @Value("${auth.google.client-id:}") String clientId) {
        this.verifier = verifier;
        this.clientId = clientId;
    }

    public GoogleIdentity verify(String idToken) {
        if (idToken == null || idToken.isBlank() || idToken.length() > 16384) {
            throw new GoogleAuthException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "id_token là bắt buộc và không được dài quá 16384 ký tự");
        }
        if (clientId == null || clientId.isBlank()) {
            throw new GoogleAuthException(HttpStatus.SERVICE_UNAVAILABLE, "GOOGLE_AUTH_NOT_CONFIGURED",
                    "Chưa cấu hình GOOGLE_CLIENT_ID cho identity-service");
        }

        // Parse separately so malformed credentials are 401, while key-fetch failures are 503.
        GoogleIdToken parsed;
        try {
            parsed = GoogleIdToken.parse(verifier.getJsonFactory(), idToken);
        } catch (IOException | IllegalArgumentException ex) {
            throw invalidToken();
        }
        if (parsed == null || !"RS256".equals(parsed.getHeader().getAlgorithm())
                || parsed.getPayload().getExpirationTimeSeconds() == null
                || parsed.getPayload().getIssuedAtTimeSeconds() == null) {
            throw invalidToken();
        }
        try {
            if (!verifier.verify(parsed)) {
                throw invalidToken();
            }
        } catch (GeneralSecurityException | IllegalArgumentException ex) {
            throw invalidToken();
        } catch (IOException ex) {
            throw new GoogleAuthException(HttpStatus.SERVICE_UNAVAILABLE, "GOOGLE_AUTH_UNAVAILABLE",
                    "Không thể xác minh token với Google, vui lòng thử lại sau");
        }

        GoogleIdToken.Payload payload = parsed.getPayload();
        String subject = payload.getSubject();
        if (subject == null || subject.isBlank() || subject.length() > 100) {
            throw invalidToken();
        }
        return new GoogleIdentity(subject, payload.getEmail(), Boolean.TRUE.equals(payload.getEmailVerified()),
                stringClaim(payload.get("name")), stringClaim(payload.get("picture")), payload.getHostedDomain());
    }

    private String stringClaim(Object value) {
        return value instanceof String text ? text : null;
    }

    private GoogleAuthException invalidToken() {
        return new GoogleAuthException(HttpStatus.UNAUTHORIZED, "GOOGLE_TOKEN_INVALID",
                "Google ID token không hợp lệ hoặc đã hết hạn");
    }
}
