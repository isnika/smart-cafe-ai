package com.smart_cafe_ai.identity_service.security;

import java.util.Locale;

public record GoogleIdentity(String subject, String email, boolean emailVerified,
                             String name, String picture, String hostedDomain) {
    public boolean hasAuthoritativeEmail() {
        return emailVerified && email != null
                && (email.toLowerCase(Locale.ROOT).endsWith("@gmail.com")
                || (hostedDomain != null && !hostedDomain.isBlank()));
    }
}
