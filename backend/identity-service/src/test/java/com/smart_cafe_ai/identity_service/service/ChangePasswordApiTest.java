package com.smart_cafe_ai.identity_service.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.identity_service.dto.auth.ChangePasswordRequest;
import com.smart_cafe_ai.identity_service.model.*;
import com.smart_cafe_ai.identity_service.repository.*;
import com.smart_cafe_ai.identity_service.security.JwtService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ChangePasswordApiTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired AuthService auth;
    @Autowired OtpService otp;
    @Autowired JwtService jwt;
    @Autowired Environment environment;
    @Autowired UserRepository users;
    @Autowired RoleRepository roles;
    @Autowired OtpLogRepository otpLogs;
    @Autowired OutboxEventRepository outbox;
    @Autowired PasswordEncoder passwords;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired EntityManager entityManager;
    @MockBean GoogleTokenVerifierService google;

    private static final String PREFIX = "/api/v1/auth";
    private static final String OLD = "OldPassword123!";
    private static final String NEW = "NewPassword456!";
    private User user;
    private String email;
    private String accessToken;

    @BeforeEach
    void setUp() {
        email = "change-" + UUID.randomUUID() + "@example.com";
        Role role = roles.findByName("Customer").orElseGet(() -> roles.save(Role.builder().name("Customer").build()));
        user = users.saveAndFlush(User.builder().fullName("Change password test").email(email)
                .passwordHash(passwords.encode(OLD)).role(role).status(UserStatus.Active).build());
        accessToken = jwt.generateAccessToken(user.getId(), "Customer");
    }

    @AfterEach
    void cleanUp() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            entityManager.createQuery("DELETE FROM RefreshToken t WHERE t.user.id = :id")
                    .setParameter("id", user.getId()).executeUpdate();
            entityManager.createQuery("DELETE FROM OtpLog o WHERE o.userId = :id")
                    .setParameter("id", user.getId()).executeUpdate();
            outbox.deleteAll(outbox.findAll().stream().filter(row -> user.getId().equals(row.getAggregateId())).toList());
            users.deleteById(user.getId());
        });
    }

    @ParameterizedTest
    @CsvSource({"/auth, Customer", "/api/auth, Customer", "/api/v1/auth, Customer",
            "/auth, Staff", "/api/auth, Staff", "/api/v1/auth, Staff"})
    void changesPasswordWithoutOtpAndRevokesOldRefreshTokens(String prefix, String roleName) throws Exception {
        user.setRole(roles.findByName(roleName).orElseGet(() -> roles.save(Role.builder().name(roleName).build())));
        users.saveAndFlush(user);
        JsonNode first = login(prefix, OLD);
        JsonNode second = login(prefix, OLD);
        long otpCount = otpLogs.count();
        long emailCount = outbox.count();

        mvc.perform(put(prefix + "/change-password").header("Authorization", "Bearer " + first.path("access_token").asText())
                        .contentType(MediaType.APPLICATION_JSON).content(body(OLD, NEW)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").value("Đổi mật khẩu thành công"));
        assertEquals(otpCount, otpLogs.count());
        assertEquals(emailCount, outbox.count());
        assertTrue(passwords.matches(NEW, users.findById(user.getId()).orElseThrow().getPasswordHash()));
        mvc.perform(post(prefix + "/login").contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("identifier", email, "password", OLD))))
                .andExpect(status().isUnauthorized());
        login(prefix, NEW);
        for (JsonNode session : List.of(first, second)) {
            mvc.perform(post(prefix + "/refresh").contentType(MediaType.APPLICATION_JSON)
                            .content(mapper.writeValueAsString(Map.of("refresh_token", session.path("refresh_token").asText()))))
                    .andExpect(status().isUnauthorized());
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"/auth", "/api/auth", "/api/v1/auth"})
    void requiresAnUnexpiredAccessTokenAndRejectsRefreshTokenAsBearer(String prefix) throws Exception {
        String validBody = body(OLD, NEW);
        mvc.perform(put(prefix + "/change-password").contentType(MediaType.APPLICATION_JSON).content(validBody))
                .andExpect(status().isUnauthorized());
        for (String token : List.of("invalid-token", jwt.generateRefreshToken(user.getId()), expiredAccessToken())) {
            mvc.perform(put(prefix + "/change-password").header("Authorization", "Bearer " + token)
                            .contentType(MediaType.APPLICATION_JSON).content(validBody))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
        }
        assertPasswordUnchanged();
    }

    @ParameterizedTest
    @EnumSource(value = UserStatus.class, names = {"Unverified", "Banned", "Deactivated"})
    void rejectsAccountsThatAreNotActive(UserStatus status) throws Exception {
        user.setStatus(status);
        users.saveAndFlush(user);
        change(body(OLD, NEW), 401, "UNAUTHORIZED");
        assertPasswordUnchanged();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "wrong-password"})
    void rejectsMissingOrWrongCurrentPassword(String current) throws Exception {
        change(body(current, NEW), 400, current.isBlank() ? "VALIDATION_ERROR" : "CURRENT_PASSWORD_INVALID");
        assertPasswordUnchanged();
    }

    @Test
    void rejectsMissingBodiesAndPasswordFields() throws Exception {
        for (String requestBody : List.of("", "null", "{}", "not-json", body(null, NEW), body(OLD, null))) {
            change(requestBody, 400, "VALIDATION_ERROR");
        }
        assertPasswordUnchanged();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "short1", "abcdefgh", "12345678", OLD})
    void rejectsWeakOrUnchangedNewPassword(String newPassword) throws Exception {
        change(body(OLD, newPassword), 400, "VALIDATION_ERROR");
        assertPasswordUnchanged();
    }

    @Test
    void enforcesBcryptByteLimitForAsciiAndUnicode() throws Exception {
        change(body(OLD, "Aa1" + "x".repeat(70)), 400, "VALIDATION_ERROR");
        change(body(OLD, "Aa1" + "á".repeat(35)), 400, "VALIDATION_ERROR");
        // The boundary is measured in UTF-8 bytes, not Java characters.
        change(body(OLD, "Aa1" + "x".repeat(69)), 200, null);
    }

    @Test
    void doesNotNeedEmailPhoneOrVerifiedContact() throws Exception {
        user.setEmail(null);
        user.setPhone(null);
        users.saveAndFlush(user);
        change(body(OLD, NEW), 200, null);
    }

    @Test
    void accountWithoutPasswordCannotSkipCurrentPasswordCheck() throws Exception {
        user.setPasswordHash(null);
        users.saveAndFlush(user);
        change(body(OLD, NEW), 400, "CURRENT_PASSWORD_NOT_SET");
        assertNull(users.findById(user.getId()).orElseThrow().getPasswordHash());
    }

    @Test
    void oldPasswordResetOtpIsInvalidatedAfterChange() throws Exception {
        otp.generateAndSaveOtp(email, OtpPurpose.Reset_Password, user.getId(), null);
        change(body(OLD, NEW), 200, null);
        assertTrue(otpLogs.findAll().stream().filter(row -> user.getId().equals(row.getUserId()))
                .allMatch(OtpLog::getIsUsed));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/auth", "/api/auth", "/api/v1/auth"})
    void removedOtpEndpointDoesNotSendAnEmail(String prefix) throws Exception {
        long count = outbox.count();
        mvc.perform(post(prefix + "/change-password/otp").header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isNotFound());
        assertEquals(count, outbox.count());
    }

    @Test
    void concurrentChangesCannotBothReuseTheOldPassword() throws Exception {
        var executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            var first = executor.submit(() -> { start.await(); return auth.changePassword(user.getId(), new ChangePasswordRequest(OLD, NEW)); });
            var second = executor.submit(() -> { start.await(); return auth.changePassword(user.getId(), new ChangePasswordRequest(OLD, "AnotherPassword789!")); });
            start.countDown();
            var firstResult = first.get(15, TimeUnit.SECONDS);
            var secondResult = second.get(15, TimeUnit.SECONDS);
            assertNotEquals(firstResult.isSuccess(), secondResult.isSuccess());
            assertEquals("CURRENT_PASSWORD_INVALID", (firstResult.isSuccess() ? secondResult : firstResult).getError().getCode());
        } finally {
            executor.shutdownNow();
        }
    }

    private void change(String requestBody, int expectedStatus, String expectedError) throws Exception {
        var result = mvc.perform(put(PREFIX + "/change-password").header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON).content(requestBody))
                .andExpect(status().is(expectedStatus));
        if (expectedError != null) {
            result.andExpect(jsonPath("$.error.code").value(expectedError));
        } else {
            result.andExpect(jsonPath("$.success").value(true)).andExpect(jsonPath("$.data").value("Đổi mật khẩu thành công"));
        }
    }

    private String body(String current, String next) throws Exception {
        Map<String, String> fields = new HashMap<>();
        fields.put("current_password", current);
        fields.put("new_password", next);
        return mapper.writeValueAsString(fields);
    }

    private JsonNode login(String prefix, String password) throws Exception {
        String response = mvc.perform(post(prefix + "/login").contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("identifier", email, "password", password))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).path("data");
    }

    private void assertPasswordUnchanged() {
        assertTrue(passwords.matches(OLD, users.findById(user.getId()).orElseThrow().getPasswordHash()));
    }

    private String expiredAccessToken() {
        JwtService expired = new JwtService();
        ReflectionTestUtils.setField(expired, "secretKey", environment.getRequiredProperty("jwt.secret"));
        ReflectionTestUtils.setField(expired, "accessTokenExpirationMs", -60000L);
        return expired.generateAccessToken(user.getId(), "Customer");
    }
}
