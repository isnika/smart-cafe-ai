package com.smart_cafe_ai.identity_service.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.identity_service.model.Role;
import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.model.UserStatus;
import com.smart_cafe_ai.identity_service.repository.RoleRepository;
import com.smart_cafe_ai.identity_service.repository.UserRepository;
import com.smart_cafe_ai.identity_service.security.JwtService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.core.env.Environment;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class LogoutAllApiTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository users;
    @Autowired RoleRepository roles;
    @Autowired PasswordEncoder passwords;
    @Autowired JwtService jwt;
    @Autowired Environment environment;
    @Autowired EntityManager entityManager;
    @MockBean GoogleTokenVerifierService google;

    @ParameterizedTest
    @CsvSource({
            "/auth, Customer", "/api/auth, Customer", "/api/v1/auth, Customer",
            "/auth, Staff", "/api/auth, Staff", "/api/v1/auth, Staff"
    })
    void revokesAllSessionsForCurrentUserOnly(String prefix, String role) throws Exception {
        User user = createUser("logout-all@example.com", role);
        JsonNode first = login(prefix, user.getEmail());
        JsonNode second = login(prefix, user.getEmail());
        User other = createUser("other@example.com", "Customer");
        JsonNode otherSession = login(prefix, other.getEmail());

        // An attempted target in the body must not override the authenticated account.
        mvc.perform(post(prefix + "/logout-all")
                        .header("Authorization", "Bearer " + first.path("access_token").asText())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("user_id", other.getId()))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true));

        // Reload database state after the repository's bulk update.
        entityManager.flush();
        entityManager.clear();
        refresh(prefix, first.path("refresh_token").asText(), false);
        refresh(prefix, second.path("refresh_token").asText(), false);
        refresh(prefix, otherSession.path("refresh_token").asText(), true);

        // Calling again is safe; existing access tokens retain their normal expiry.
        mvc.perform(post(prefix + "/logout-all")
                        .header("Authorization", "Bearer " + first.path("access_token").asText()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true));
        refresh(prefix, login(prefix, user.getEmail()).path("refresh_token").asText(), true);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/auth", "/api/auth", "/api/v1/auth"})
    void rejectsMissingInvalidAndExpiredAuthenticationWithoutRevokingTokens(String prefix) throws Exception {
        User user = createUser("logout-all@example.com", "Customer");
        JsonNode session = login(prefix, user.getEmail());
        mvc.perform(post(prefix + "/logout-all"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
        mvc.perform(post(prefix + "/logout-all").header("Authorization", "Bearer invalid-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));

        JwtService expiredJwt = new JwtService();
        ReflectionTestUtils.setField(expiredJwt, "secretKey", environment.getRequiredProperty("jwt.secret"));
        ReflectionTestUtils.setField(expiredJwt, "accessTokenExpirationMs", -60000L);
        mvc.perform(post(prefix + "/logout-all")
                        .header("Authorization", "Bearer " + expiredJwt.generateAccessToken(user.getId(), "Customer")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
        refresh(prefix, session.path("refresh_token").asText(), true);
    }

    @Test
    void succeedsWhenAccountHasNoRefreshTokens() throws Exception {
        User user = createUser("logout-all@example.com", "Customer");
        mvc.perform(post("/auth/logout-all")
                        .header("Authorization", "Bearer " + jwt.generateAccessToken(user.getId(), "Customer")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true));
    }

    private User createUser(String email, String roleName) {
        Role role = roles.findByName(roleName).orElseGet(() -> roles.save(Role.builder().name(roleName).build()));
        return users.saveAndFlush(User.builder().email(email).fullName("Logout test")
                .passwordHash(passwords.encode("Password123!"))
                .role(role).status(UserStatus.Active).build());
    }

    private JsonNode login(String prefix, String email) throws Exception {
        String response = mvc.perform(post(prefix + "/login").contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("identifier", email, "password", "Password123!"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true))
                .andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).path("data");
    }

    private void refresh(String prefix, String token, boolean succeeds) throws Exception {
        mvc.perform(post(prefix + "/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("refresh_token", token))))
                .andExpect(succeeds ? status().isOk() : status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(succeeds));
    }
}
