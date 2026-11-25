package com.smart_cafe_ai.store_service.client;

import feign.RequestTemplate;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class IdentityClientConfigTest {
    @Test
    void sendsServiceKeyToIdentity() {
        RequestTemplate request = new RequestTemplate();
        new IdentityClientConfig().identityServiceKey("test-key").apply(request);
        assertThat(request.headers().get("X-Service-Key")).containsExactly("test-key");
    }
}
