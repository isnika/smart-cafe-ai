package com.smart_cafe_ai.identity_service.service;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "app.internal-api-key=identity-service-test-key")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class InternalUserSecurityApiTest {
    @Autowired MockMvc mvc;
    @MockBean GoogleTokenVerifierService google;

    @Test void bothAliasesRequireServiceCredentials() throws Exception {
        for (String prefix : new String[]{"/internal/users", "/api/v1/internal/users"}) {
            mvc.perform(post(prefix + "/batch").contentType("application/json").content("{\"ids\":[]}"))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("error.code").value("UNAUTHORIZED"));
            mvc.perform(post(prefix + "/batch").header("X-Service-Key", "wrong")
                            .contentType("application/json").content("{\"ids\":[]}"))
                    .andExpect(status().isForbidden());
            mvc.perform(post(prefix + "/batch").header("X-Service-Key", "identity-service-test-key")
                            .contentType("application/json").content("{\"ids\":[]}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("success").value(true))
                    .andExpect(jsonPath("data").isEmpty());
        }
    }

    @Test void serviceKeyDoesNotGrantEndUserPrivileges() throws Exception {
        mvc.perform(get("/admin/users").header("X-Service-Key", "identity-service-test-key"))
                .andExpect(status().isUnauthorized());
    }
}
