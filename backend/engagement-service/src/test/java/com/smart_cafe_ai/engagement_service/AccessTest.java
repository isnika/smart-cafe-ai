package com.smart_cafe_ai.engagement_service;
import com.smart_cafe_ai.engagement_service.exception.ApiException;
import com.smart_cafe_ai.engagement_service.security.Access;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.junit.jupiter.api.Assertions.*;
class AccessTest {
    @Test void missingJwtConfigurationDoesNotPreventOtpStartupOrAcceptTokens() {
        var access=new Access("","");
        var request=new MockHttpServletRequest(); request.addHeader("Authorization","Bearer anything");
        assertEquals("JWT_AUTH_NOT_CONFIGURED",assertThrows(ApiException.class,()->access.customer(request)).code);
    }
    @Test void internalCommandsRejectMissingConfigurationAndWrongKey() {
        var request=new MockHttpServletRequest(); request.addHeader("X-Service-Key","wrong");
        assertEquals("INTERNAL_AUTH_NOT_CONFIGURED",assertThrows(ApiException.class,()->new Access("","").internal(request)).code);
        assertEquals("FORBIDDEN",assertThrows(ApiException.class,()->new Access("","configured-secret").internal(request)).code);
    }
}
