package com.smart_cafe_ai.identity_service.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.identity_service.exception.GoogleAuthException;
import com.smart_cafe_ai.identity_service.model.Role;
import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.model.UserStatus;
import com.smart_cafe_ai.identity_service.repository.RoleRepository;
import com.smart_cafe_ai.identity_service.repository.UserRepository;
import com.smart_cafe_ai.identity_service.security.GoogleIdentity;
import com.smart_cafe_ai.identity_service.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class GoogleAuthApiTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository users;
    @Autowired RoleRepository roles;
    @Autowired PasswordEncoder passwords;
    @Autowired JwtService jwt;
    @Autowired Environment environment;
    @MockBean GoogleTokenVerifierService google;

    private static final String BODY = "{\"id_token\":\"google-token\",\"device_info\":\"Postman\"}";

    @BeforeEach
    void setUp() {
        when(google.verify("google-token")).thenReturn(new GoogleIdentity("api-google-id",
                "api-test@gmail.com", true, "API Customer", null, null));
    }

    @Test
    void loginProfileRefreshRotationAndLogoutWorkWithRealDatabaseAndJwt() throws Exception {
        JsonNode first = login("/api/v1/auth");
        assertTrue(first.path("is_new_user").asBoolean());
        assertFalse(first.has("newUser"));
        String userId = first.path("user").path("id").asText();
        String accessToken = first.path("access_token").asText();
        String refreshToken = first.path("refresh_token").asText();

        mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(userId))
                .andExpect(jsonPath("$.data.email").value("api-test@gmail.com"))
                .andExpect(jsonPath("$.data.password_hash").doesNotExist())
                .andExpect(jsonPath("$.data.passwordHash").doesNotExist());
        JsonNode second = login("/api/v1/auth");
        assertFalse(second.path("is_new_user").asBoolean());
        assertEquals(userId, second.path("user").path("id").asText());
        assertNotEquals(refreshToken, second.path("refresh_token").asText());

        String refreshed = mvc.perform(post("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refresh_token\":\"" + refreshToken + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String rotated = mapper.readTree(refreshed).path("data").path("refresh_token").asText();
        assertNotEquals(refreshToken, rotated);
        mvc.perform(post("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refresh_token\":\"" + refreshToken + "\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/logout").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refresh_token\":\"" + rotated + "\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refresh_token\":\"" + rotated + "\"}"))
                .andExpect(status().isUnauthorized());
    }

    @ParameterizedTest
    @ValueSource(strings = {"/users/me", "/api/v1/users/me"})
    void profileWithoutTokenReturnsUnauthorizedJson(String path) throws Exception {
        mvc.perform(get(path))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.traceId").isNotEmpty())
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    @ParameterizedTest
    @ValueSource(strings = {"Bearer invalid-token", "Bearer ", "Basic credentials", "Bearer null"})
    void profileRejectsMalformedAuthentication(String authorization) throws Exception {
        mvc.perform(get("/api/v1/users/me").header("Authorization", authorization))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @ParameterizedTest
    @EnumSource(value = UserStatus.class, names = {"Active", "Banned", "Deactivated"})
    void profileRejectsExpiredTokenBeforeCheckingAccountStatus(UserStatus status) throws Exception {
        User user = existingUser(status);
        JwtService expired = new JwtService();
        ReflectionTestUtils.setField(expired, "secretKey", environment.getRequiredProperty("jwt.secret"));
        ReflectionTestUtils.setField(expired, "accessTokenExpirationMs", -60000L);
        mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer "
                        + expired.generateAccessToken(user.getId(), "Customer")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @Test
    void profileRejectsRefreshTokenAndUnknownUser() throws Exception {
        User user = existingUser(UserStatus.Active);
        for (String token : List.of(jwt.generateRefreshToken(user.getId()),
                jwt.generateAccessToken("nonexistent-user", "Customer"))) {
            mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + token))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
        }
    }

    @ParameterizedTest
    @EnumSource(value = UserStatus.class, names = {"Unverified", "Banned", "Deactivated"})
    void profileRejectsAccountDisabledAfterTokenWasIssued(UserStatus status) throws Exception {
        User user = existingUser(UserStatus.Active);
        String token = jwt.generateAccessToken(user.getId(), "Customer");
        user.setStatus(status);
        users.saveAndFlush(user);
        mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error.code").value("ACCOUNT_DISABLED"))
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    @Test
    void authenticatedCustomerWithoutAdminPermissionGetsForbiddenJson() throws Exception {
        User user = existingUser(UserStatus.Active);
        mvc.perform(get("/api/v1/admin/users").header("Authorization", "Bearer "
                        + jwt.generateAccessToken(user.getId(), "Customer")))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/auth", "/api/auth"})
    void supportsExistingAuthAliases(String prefix) throws Exception {
        login(prefix);
    }

    @Test
    void linkingRequiresAuthentication() throws Exception {
        mvc.perform(post("/api/v1/auth/google/link").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
        verifyNoInteractions(google);
    }

    @Test
    void existingUserMustLoginBeforeLinkingAndCanThenUseGoogle() throws Exception {
        User user = existingUser(UserStatus.Active);
        mvc.perform(post("/api/v1/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("ACCOUNT_LINK_REQUIRED"));
        String result = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identifier\":\"api-test@gmail.com\",\"password\":\"Password123!\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String accessToken = mapper.readTree(result).path("data").path("access_token").asText();
        mvc.perform(post("/api/v1/auth/google/link").header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.is_new_user").value(false));
        assertEquals("api-google-id", users.findById(user.getId()).orElseThrow().getGoogleId());
        assertEquals(user.getId(), login("/api/v1/auth").path("user").path("id").asText());
    }

    @Test
    void bannedAccountGetsForbiddenAndNoLink() throws Exception {
        User user = existingUser(UserStatus.Banned);
        mvc.perform(post("/api/v1/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("ACCOUNT_BANNED"));
        assertNull(user.getGoogleId());
    }

    @Test
    void existingMixedCaseEmailRequiresLinkInsteadOfCreatingDuplicateUser() throws Exception {
        User user = existingUser(UserStatus.Active);
        user.setEmail("API-Test@Gmail.com");
        users.saveAndFlush(user);
        long count = users.count();
        mvc.perform(post("/api/v1/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("ACCOUNT_LINK_REQUIRED"));
        assertEquals(count, users.count());
    }

    @Test
    void rejectsMissingBodyAndMissingToken() throws Exception {
        mvc.perform(post("/api/v1/auth/google").contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        mvc.perform(post("/api/v1/auth/google").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void invalidTokenIsUnauthorizedWithApiErrorEnvelope() throws Exception {
        when(google.verify("google-token")).thenThrow(new GoogleAuthException(HttpStatus.UNAUTHORIZED,
                "GOOGLE_TOKEN_INVALID", "Invalid Google token"));
        mvc.perform(post("/api/v1/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error.code").value("GOOGLE_TOKEN_INVALID"));
    }

    private JsonNode login(String prefix) throws Exception {
        String json = mvc.perform(post(prefix + "/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.access_token").isNotEmpty())
                .andExpect(jsonPath("$.data.refresh_token").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        return mapper.readTree(json).path("data");
    }

    private User existingUser(UserStatus status) {
        Role role = roles.findByName("Customer").orElseGet(() ->
                roles.save(Role.builder().name("Customer").description("Customer").build()));
        return users.saveAndFlush(User.builder().email("api-test@gmail.com").fullName("Existing customer")
                .passwordHash(passwords.encode("Password123!")).role(role).status(status).build());
    }
}
