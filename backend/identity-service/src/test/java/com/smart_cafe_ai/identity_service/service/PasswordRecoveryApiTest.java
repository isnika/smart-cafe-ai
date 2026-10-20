package com.smart_cafe_ai.identity_service.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.identity_service.dto.ApiResponse;
import com.smart_cafe_ai.identity_service.dto.auth.ForgotPasswordRequest;
import com.smart_cafe_ai.identity_service.dto.auth.ResetPasswordRequest;
import com.smart_cafe_ai.identity_service.dto.event.OtpEmailEvent;
import com.smart_cafe_ai.identity_service.model.*;
import com.smart_cafe_ai.identity_service.repository.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PasswordRecoveryApiTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired AuthService auth;
    @Autowired OtpService otp;
    @Autowired UserRepository users;
    @Autowired RoleRepository roles;
    @Autowired OtpLogRepository otpLogs;
    @Autowired OutboxEventRepository outbox;
    @Autowired PasswordEncoder passwords;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired EntityManager entityManager;

    private User user;
    private String email;
    private static final String PREFIX = "/api/v1/auth";
    private static final String OLD_PASSWORD = "OldPassword123!";
    private static final String NEW_PASSWORD = "NewPassword456!";

    @BeforeEach
    void setUp() {
        email = "recovery-" + UUID.randomUUID() + "@example.com";
        Role role = roles.findByName("Customer").orElseGet(() -> roles.save(Role.builder().name("Customer").build()));
        user = users.saveAndFlush(User.builder().fullName("Password recovery test").email(email)
                .passwordHash(passwords.encode(OLD_PASSWORD)).role(role).status(UserStatus.Active).build());
    }

    @AfterEach
    void cleanUp() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            entityManager.createQuery("DELETE FROM RefreshToken t WHERE t.user.id = :id")
                    .setParameter("id", user.getId()).executeUpdate();
            entityManager.createQuery("DELETE FROM OtpLog o WHERE o.target = :email")
                    .setParameter("email", email).executeUpdate();
            outbox.deleteAll(outbox.findAll().stream().filter(row -> user.getId().equals(row.getAggregateId())
                    || row.getPayload().contains(email)).toList());
            users.deleteById(user.getId());
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {"/auth", "/api/auth", "/api/v1/auth"})
    void forgotPasswordQueuesEmailAndResetChangesPasswordAndRevokesAllSessions(String prefix) throws Exception {
        JsonNode firstSession = login(prefix, OLD_PASSWORD);
        JsonNode secondSession = login(prefix, OLD_PASSWORD);
        requestOtp(prefix, " " + email.toUpperCase(Locale.ROOT) + " ");
        OtpEmailEvent event = latestEmail();
        assertEquals(email, event.email());
        assertEquals("Reset_Password", event.purpose());
        assertEquals(user.getId(), event.userId());
        assertTrue(event.otpCode().matches("\\d{6}"));
        OtpLog storedOtp = latestOtp();
        assertNotEquals(event.otpCode(), storedOtp.getOtpHash());
        assertTrue(passwords.matches(event.otpCode(), storedOtp.getOtpHash()));

        reset(prefix, event.otpCode(), NEW_PASSWORD, 200);
        assertTrue(passwords.matches(NEW_PASSWORD, users.findById(user.getId()).orElseThrow().getPasswordHash()));
        mvc.perform(post(prefix + "/login").contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("identifier", email, "password", OLD_PASSWORD))))
                .andExpect(status().isUnauthorized());
        login(prefix, NEW_PASSWORD);
        for (JsonNode session : List.of(firstSession, secondSession)) {
            mvc.perform(post(prefix + "/refresh").contentType(MediaType.APPLICATION_JSON)
                            .content(mapper.writeValueAsString(Map.of("refresh_token", session.path("refresh_token").asText()))))
                    .andExpect(status().isUnauthorized());
        }
        reset(prefix, event.otpCode(), "AnotherPassword789!", 400);
    }

    @Test
    void unknownEmailAndCooldownReturnSameResponseWithoutCreatingExtraMessages() throws Exception {
        String accepted = requestOtp(PREFIX, email);
        assertEquals(accepted, requestOtp(PREFIX, email));
        assertEquals(accepted, requestOtp(PREFIX, "unknown-" + UUID.randomUUID() + "@example.com"));
        assertEquals(1, resetEmails().size());
    }

    @ParameterizedTest
    @EnumSource(value = UserStatus.class, names = {"Unverified", "Banned", "Deactivated"})
    void inactiveAccountsDoNotReceiveRecoveryCodes(UserStatus status) throws Exception {
        user.setStatus(status);
        users.saveAndFlush(user);
        requestOtp(PREFIX, email);
        assertTrue(resetEmails().isEmpty());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "invalid-email", "0901234567", "a@b", "a b@example.com"})
    void rejectsInvalidEmailAndUnsupportedSms(String identifier) throws Exception {
        mvc.perform(post(PREFIX + "/forgot-password").contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("phone_email", identifier))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        assertTrue(resetEmails().isEmpty());
    }

    @Test
    void rejectsMissingAndMalformedBodies() throws Exception {
        for (String path : List.of("/forgot-password", "/reset-password")) {
            for (String body : List.of("", "null", "{}", "not-json")) {
                mvc.perform(post(PREFIX + path).contentType(MediaType.APPLICATION_JSON).content(body))
                        .andExpect(status().isBadRequest())
                        .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
            }
        }
    }

    @Test
    void rejectsWeakOrTooLongPasswordWithoutConsumingOtp() throws Exception {
        requestOtp(PREFIX, email);
        String code = latestEmail().otpCode();
        for (String password : List.of("", "short1", "abcdefgh", "12345678", "Aa1" + "x".repeat(70), "Aa1" + "á".repeat(35))) {
            mvc.perform(post(PREFIX + "/reset-password").contentType(MediaType.APPLICATION_JSON)
                            .content(resetBody(code, password)))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        }
        assertFalse(latestOtp().getIsUsed());
        reset(PREFIX, code, NEW_PASSWORD, 200);
    }

    @Test
    void fiveWrongAttemptsBlockEvenTheCorrectCode() throws Exception {
        requestOtp(PREFIX, email);
        String correct = latestEmail().otpCode();
        String wrong = correct.equals("000000") ? "111111" : "000000";
        for (int attempt = 0; attempt < 4; attempt++) {
            reset(PREFIX, wrong, NEW_PASSWORD, 400);
        }
        assertLocked("/reset-password", resetBody(wrong, NEW_PASSWORD));
        LocalDateTime lockedUntil = latestOtp().getLockedUntil();
        assertNotNull(lockedUntil);
        assertTrue(lockedUntil.isAfter(LocalDateTime.now().plusSeconds(50)));
        assertLocked("/reset-password", resetBody(correct, NEW_PASSWORD));
        assertEquals(5, latestOtp().getAttemptCount());
        assertEquals(lockedUntil, latestOtp().getLockedUntil());
        assertTrue(passwords.matches(OLD_PASSWORD, users.findById(user.getId()).orElseThrow().getPasswordHash()));
    }

    @Test
    void lockStartsAtFifthFailureAndBlocksResendUntilItsDeadline() throws Exception {
        requestOtp(PREFIX, email);
        String originalCode = latestEmail().otpCode();
        // The original 60-second sending cooldown already elapsed before the failures.
        ageResetRequests();
        String wrong = originalCode.equals("000000") ? "111111" : "000000";
        for (int attempt = 0; attempt < 4; attempt++) {
            reset(PREFIX, wrong, NEW_PASSWORD, 400);
        }
        assertLocked("/reset-password", resetBody(wrong, NEW_PASSWORD));
        assertLocked("/forgot-password", mapper.writeValueAsString(Map.of("phone_email", email)));
        assertEquals(1, resetEmails().size());

        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            OtpLog row = otpLogs.findById(latestOtp().getId()).orElseThrow();
            row.setLockedUntil(LocalDateTime.now().plusSeconds(20));
        });
        long remaining = assertLocked("/forgot-password", mapper.writeValueAsString(Map.of("phone_email", email)));
        assertTrue(remaining <= 20);

        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            OtpLog row = otpLogs.findById(latestOtp().getId()).orElseThrow();
            row.setLockedUntil(LocalDateTime.now().minusSeconds(1));
        });
        // Waiting does not make the exhausted old OTP usable again.
        reset(PREFIX, originalCode, NEW_PASSWORD, 400);
        requestOtp(PREFIX, email);
        assertEquals(2, resetEmails().size());
        assertEquals(0, latestOtp().getAttemptCount());
        assertNull(latestOtp().getLockedUntil());
        reset(PREFIX, latestEmail().otpCode(), NEW_PASSWORD, 200);
    }

    @Test
    void correctFifthAttemptSucceedsWithoutLockingAccount() throws Exception {
        requestOtp(PREFIX, email);
        String code = latestEmail().otpCode();
        String wrong = code.equals("000000") ? "111111" : "000000";
        for (int attempt = 0; attempt < 4; attempt++) {
            reset(PREFIX, wrong, NEW_PASSWORD, 400);
        }
        reset(PREFIX, code, NEW_PASSWORD, 200);
        assertNull(latestOtp().getLockedUntil());
    }

    @Test
    void concurrentWrongAttemptsCommitExactlyOneLock() throws Exception {
        requestOtp(PREFIX, email);
        String code = latestEmail().otpCode();
        String wrong = code.equals("000000") ? "111111" : "000000";
        for (int attempt = 0; attempt < 4; attempt++) {
            reset(PREFIX, wrong, NEW_PASSWORD, 400);
        }
        String body = resetBody(wrong, NEW_PASSWORD);
        var executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            var first = executor.submit(() -> { start.await(); return assertLocked("/reset-password", body); });
            var second = executor.submit(() -> { start.await(); return assertLocked("/reset-password", body); });
            start.countDown();
            first.get(15, TimeUnit.SECONDS);
            second.get(15, TimeUnit.SECONDS);
            assertEquals(5, latestOtp().getAttemptCount());
            assertNotNull(latestOtp().getLockedUntil());
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void expiredCodeCannotResetPassword() throws Exception {
        requestOtp(PREFIX, email);
        String code = latestEmail().otpCode();
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            OtpLog row = otpLogs.findById(latestOtp().getId()).orElseThrow();
            row.setExpiresAt(LocalDateTime.now().minusSeconds(1));
        });
        reset(PREFIX, code, NEW_PASSWORD, 400);
    }

    @Test
    void resendInvalidatesOldCodeAndItCannotReappearAfterNewestCodeIsUsed() throws Exception {
        requestOtp(PREFIX, email);
        OtpEmailEvent first = latestEmail();
        Long firstId = latestOtp().getId();
        ageResetRequests();
        requestOtp(PREFIX, email);
        assertEquals(2, resetEmails().size());
        assertTrue(otpLogs.findById(firstId).orElseThrow().getIsUsed());
        reset(PREFIX, latestEmail().otpCode(), NEW_PASSWORD, 200);
        reset(PREFIX, first.otpCode(), "AnotherPassword789!", 400);
    }

    @Test
    void hourlyQuotaStillAppliesAfterCooldown() throws Exception {
        for (int request = 0; request < 5; request++) {
            requestOtp(PREFIX, email);
            ageResetRequests();
        }
        requestOtp(PREFIX, email);
        assertEquals(5, resetEmails().size());
    }

    @Test
    void resetRequiresCorrectPurposeAndAccountBinding() throws Exception {
        String registrationCode = otp.generateAndSaveOtp(email, OtpPurpose.Register, user.getId(), null);
        reset(PREFIX, registrationCode, NEW_PASSWORD, 400);
        String anotherAccountCode = otp.generateAndSaveOtp(email, OtpPurpose.Reset_Password, "another-account", null);
        reset(PREFIX, anotherAccountCode, NEW_PASSWORD, 400);
    }

    @Test
    void concurrentForgotRequestsQueueOnlyOneEmail() throws Exception {
        var executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            var first = executor.submit(() -> { start.await(); return auth.forgotPassword(new ForgotPasswordRequest(email)); });
            var second = executor.submit(() -> { start.await(); return auth.forgotPassword(new ForgotPasswordRequest(email)); });
            start.countDown();
            assertTrue(first.get(15, TimeUnit.SECONDS).isSuccess());
            assertTrue(second.get(15, TimeUnit.SECONDS).isSuccess());
            assertEquals(1, resetEmails().size());
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void concurrentResetsCanConsumeCodeOnlyOnce() throws Exception {
        requestOtp(PREFIX, email);
        String code = latestEmail().otpCode();
        var executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            var first = executor.submit(() -> {
                start.await();
                return auth.resetPassword(new ResetPasswordRequest(email, code, NEW_PASSWORD));
            });
            var second = executor.submit(() -> {
                start.await();
                return auth.resetPassword(new ResetPasswordRequest(email, code, "AnotherPassword789!"));
            });
            start.countDown();
            ApiResponse<Void> firstResult = first.get(15, TimeUnit.SECONDS);
            ApiResponse<Void> secondResult = second.get(15, TimeUnit.SECONDS);
            assertNotEquals(firstResult.isSuccess(), secondResult.isSuccess());
            assertTrue(latestOtp().getIsUsed());
        } finally {
            executor.shutdownNow();
        }
    }

    private String requestOtp(String prefix, String identifier) throws Exception {
        String body = mvc.perform(post(prefix + "/forgot-password").contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("phone_email", identifier))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.otp_code").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        return mapper.readTree(body).path("data").asText();
    }

    private void reset(String prefix, String code, String password, int expectedStatus) throws Exception {
        mvc.perform(post(prefix + "/reset-password").contentType(MediaType.APPLICATION_JSON)
                        .content(resetBody(code, password)))
                .andExpect(status().is(expectedStatus))
                .andExpect(expectedStatus == 200 ? jsonPath("$.success").value(true)
                        : jsonPath("$.error.code").value("OTP_INVALID"));
    }

    private String resetBody(String code, String password) throws Exception {
        return mapper.writeValueAsString(Map.of("phone_email", email, "otp_code", code, "new_password", password));
    }

    private long assertLocked(String path, String body) throws Exception {
        var response = mvc.perform(post(PREFIX + path).header("Origin", "http://localhost:5173")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error.code").value("OTP_TOO_MANY_ATTEMPTS"))
                .andExpect(jsonPath("$.error.message").value(org.hamcrest.Matchers.containsString("trước khi yêu cầu mã mới")))
                .andExpect(header().exists("Retry-After"))
                .andExpect(header().string("Access-Control-Expose-Headers", "Retry-After"))
                .andReturn().getResponse();
        long seconds = Long.parseLong(response.getHeader("Retry-After"));
        assertTrue(seconds > 0 && seconds <= 60);
        return seconds;
    }

    private JsonNode login(String prefix, String password) throws Exception {
        String body = mvc.perform(post(prefix + "/login").contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("identifier", email, "password", password))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(body).path("data");
    }

    private List<OutboxEvent> resetEmails() {
        return outbox.findAll().stream().filter(row -> user.getId().equals(row.getAggregateId())
                && row.getPayload().contains("Reset_Password")).toList();
    }

    private OtpEmailEvent latestEmail() throws Exception {
        List<OutboxEvent> rows = resetEmails();
        OutboxEvent last = rows.stream().max(java.util.Comparator.comparing(OutboxEvent::getId)).orElseThrow();
        return mapper.readValue(last.getPayload(), OtpEmailEvent.class);
    }

    private OtpLog latestOtp() {
        return otpLogs.findAll().stream().filter(row -> user.getId().equals(row.getUserId())
                        && row.getPurpose() == OtpPurpose.Reset_Password)
                .max(java.util.Comparator.comparing(OtpLog::getId)).orElseThrow();
    }

    private void ageResetRequests() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status ->
                entityManager.createQuery("UPDATE OtpLog o SET o.createdAt = :time WHERE o.userId = :userId")
                        .setParameter("time", LocalDateTime.now().minusMinutes(2))
                        .setParameter("userId", user.getId()).executeUpdate());
    }
}
