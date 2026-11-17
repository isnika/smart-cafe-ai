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

    @Test
    void differentGoogleSubjectsHaveIndependentAccountsProfilesAndTokensEvenWithOldBearer() throws Exception {
        User existing = existingUser(UserStatus.Active);
        JsonNode first = login("/api/v1/auth");
        assertEquals(existing.getId(), first.path("user").path("id").asText());
        long userCount = users.count();

        when(google.verify("new-google-token")).thenReturn(new GoogleIdentity("new-google-subject",
                "new-google-user@gmail.com", true, "New Google Customer", null, null));
        String json = mvc.perform(post("/api/v1/auth/google")
                        .header("Authorization", "Bearer " + first.path("access_token").asText())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"id_token\":\"new-google-token\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.is_new_user").value(true))
                .andExpect(jsonPath("$.data.user.email").value("new-google-user@gmail.com"))
                .andExpect(jsonPath("$.data.user.full_name").value("New Google Customer"))
                .andReturn().getResponse().getContentAsString();
        JsonNode second = mapper.readTree(json).path("data");
        String newUserId = second.path("user").path("id").asText();
        assertNotEquals(existing.getId(), newUserId);
        assertEquals(userCount + 1, users.count());
        assertEquals(newUserId, users.findByGoogleId("new-google-subject").orElseThrow().getId());
        assertEquals(existing.getId(), users.findByGoogleId("api-google-id").orElseThrow().getId());
        assertEquals(newUserId, jwt.extractUserId(second.path("access_token").asText()));
        assertEquals(newUserId, jwt.extractUserId(second.path("refresh_token").asText()));

        mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + second.path("access_token").asText()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(newUserId))
                .andExpect(jsonPath("$.data.email").value("new-google-user@gmail.com"));
        mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + first.path("access_token").asText()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(existing.getId()))
                .andExpect(jsonPath("$.data.email").value("api-test@gmail.com"));
        mvc.perform(post("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refresh_token\":\"" + second.path("refresh_token").asText() + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.user.id").value(newUserId));
        mvc.perform(post("/api/v1/auth/google").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id_token\":\"new-google-token\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.is_new_user").value(false))
                .andExpect(jsonPath("$.data.user.id").value(newUserId));
        assertEquals(userCount + 1, users.count());
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
                        + expired.generateAccessToken(user.getId(), "ROLE_CUSTOMER")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @Test
    void profileRejectsRefreshTokenAndUnknownUser() throws Exception {
        User user = existingUser(UserStatus.Active);
        for (String token : List.of(jwt.generateRefreshToken(user.getId()),
                jwt.generateAccessToken("nonexistent-user", "ROLE_CUSTOMER"))) {
            mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + token))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
        }
    }

    @ParameterizedTest
    @EnumSource(value = UserStatus.class, names = {"Unverified", "Banned", "Deactivated"})
    void profileRejectsAccountDisabledAfterTokenWasIssued(UserStatus status) throws Exception {
        User user = existingUser(UserStatus.Active);
        String token = jwt.generateAccessToken(user.getId(), "ROLE_CUSTOMER");
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
                        + jwt.generateAccessToken(user.getId(), "ROLE_CUSTOMER")))
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

    @ParameterizedTest
    @ValueSource(strings = {"/auth", "/api/auth", "/api/v1/auth"})
    void existingEmailCanLoginWithGoogleImmediatelyAndStillUsePassword(String prefix) throws Exception {
        User user = existingUser(UserStatus.Active);
        String passwordHash = user.getPasswordHash();
        var verifiedAt = java.time.LocalDateTime.now().minusDays(1).withNano(0);
        user.setEmailVerifiedAt(verifiedAt);
        user.setPhone("0901234567");
        users.saveAndFlush(user);
        long count = users.count();

        JsonNode session = login(prefix);
        assertEquals(user.getId(), session.path("user").path("id").asText());
        assertFalse(session.path("is_new_user").asBoolean());
        assertEquals(count, users.count());
        User linked = users.findById(user.getId()).orElseThrow();
        assertEquals("api-google-id", linked.getGoogleId());
        assertEquals(passwordHash, linked.getPasswordHash());
        assertEquals("Existing customer", linked.getFullName());
        assertEquals("0901234567", linked.getPhone());
        assertEquals(verifiedAt, linked.getEmailVerifiedAt());

        mvc.perform(post(prefix + "/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identifier\":\"api-test@gmail.com\",\"password\":\"Password123!\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.user.id").value(user.getId()));
        assertEquals(user.getId(), login(prefix).path("user").path("id").asText());
        mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + session.path("access_token").asText()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(user.getId()));
    }

    @Test
    void explicitGoogleLinkRemainsAvailable() throws Exception {
        User user = existingUser(UserStatus.Active);
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

    @ParameterizedTest
    @EnumSource(value = UserStatus.class, names = {"Banned", "Deactivated", "Unverified"})
    void inactiveAccountGetsForbiddenAndNoLink(UserStatus status) throws Exception {
        User user = existingUser(status);
        String code = switch (status) {
            case Banned -> "ACCOUNT_BANNED";
            case Deactivated -> "ACCOUNT_DEACTIVATED";
            default -> "ACCOUNT_UNVERIFIED";
        };
        mvc.perform(post("/api/v1/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value(code));
        assertNull(user.getGoogleId());
    }

    @Test
    void existingMixedCaseEmailAutoLinksInsteadOfCreatingDuplicateUser() throws Exception {
        User user = existingUser(UserStatus.Active);
        user.setEmail("API-Test@Gmail.com");
        users.saveAndFlush(user);
        long count = users.count();
        mvc.perform(post("/api/v1/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.user.id").value(user.getId()))
                .andExpect(jsonPath("$.data.is_new_user").value(false));
        assertEquals(count, users.count());
        assertEquals("api-google-id", users.findById(user.getId()).orElseThrow().getGoogleId());
    }

    @Test
    void matchingEmailCannotReplaceExistingGoogleLink() throws Exception {
        User user = existingUser(UserStatus.Active);
        user.setGoogleId("another-google-id");
        users.saveAndFlush(user);
        mvc.perform(post("/api/v1/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("GOOGLE_ACCOUNT_CONFLICT"));
        assertEquals("another-google-id", users.findById(user.getId()).orElseThrow().getGoogleId());
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
        Role role = roles.findByName("ROLE_CUSTOMER").orElseGet(() ->
                roles.save(Role.builder().name("ROLE_CUSTOMER").description("ROLE_CUSTOMER").build()));
        return users.saveAndFlush(User.builder().email("api-test@gmail.com").fullName("Existing customer")
                .passwordHash(passwords.encode("Password123!")).role(role).status(status).build());
    }
}
