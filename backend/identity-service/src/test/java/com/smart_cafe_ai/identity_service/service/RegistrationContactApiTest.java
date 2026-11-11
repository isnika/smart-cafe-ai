package com.smart_cafe_ai.identity_service.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.identity_service.model.*;
import com.smart_cafe_ai.identity_service.repository.*;
import com.smart_cafe_ai.identity_service.security.JwtService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class RegistrationContactApiTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository users;
    @Autowired RoleRepository roles;
    @Autowired OtpLogRepository otps;
    @Autowired OutboxEventRepository outbox;
    @Autowired OtpService otp;
    @Autowired JwtService jwt;
    @Autowired EntityManager entityManager;
    @Autowired PlatformTransactionManager transactions;
    @MockBean GoogleTokenVerifierService google;
    final List<String> testUsers = new ArrayList<>();
    User user;
    String token;
    static final String CONTACT = "/api/v1/users/me/contact";

    @BeforeEach
    void setUp() {
        user = createUser("contact-test@example.com", "0901234567");
        token = jwt.generateAccessToken(user.getId(), "Customer");
    }

    User createUser(String email, String phone) {
        Role role = roles.findByName("Customer").orElseGet(() -> roles.save(Role.builder().name("Customer").build()));
        User result = users.saveAndFlush(User.builder().email(email).phone(phone).fullName("Nguyễn Văn An")
                .passwordHash("test-hash").role(role).status(UserStatus.Active).emailVerifiedAt(LocalDateTime.now()).build());
        testUsers.add(result.getId());
        return result;
    }

    @AfterEach
    void cleanupNonTransactionalTests() {
        if (TransactionSynchronizationManager.isActualTransactionActive()) return;
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            entityManager.createQuery("delete from OtpLog o where o.userId in :ids").setParameter("ids", testUsers).executeUpdate();
            outbox.deleteAll(outbox.findAll().stream().filter(e -> testUsers.contains(e.getAggregateId())).toList());
            users.deleteAllById(testUsers);
        });
    }

    Map<String, Object> registration() {
        return new HashMap<>(Map.of("full_name", "  Nguyễn   Thị Ánh  ", "email", " NEW-REG@Example.com ",
                "phone", "+84911111111", "password", "Password123!"));
    }

    @Test
    void registrationRequiresBothContactsAndUsesExistingNameRules() throws Exception {
        for (String field : List.of("email", "phone")) {
            for (Object value : Arrays.asList(null, "", "  ")) {
                Map<String, Object> body = registration(); body.put(field, value);
                mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
            }
            Map<String, Object> body = registration(); body.remove(field);
            mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                    .andExpect(status().isBadRequest());
        }
        Map<String, Object> body = registration(); body.put("full_name", "An123");
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
        assertEquals(1, users.count());
        assertEquals(0, otps.count());
    }

    @Test
    void registrationNormalizesBothContactsAndAlwaysQueuesEmailOtp() throws Exception {
        String json = mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(registration())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.email").value("new-reg@example.com"))
                .andExpect(jsonPath("$.data.phone").value("0911111111"))
                .andExpect(jsonPath("$.data.full_name").value("Nguyễn Thị Ánh"))
                .andReturn().getResponse().getContentAsString();
        String id = mapper.readTree(json).path("data").path("id").asText();
        OtpLog row = otps.findAll().stream().filter(o -> id.equals(o.getUserId())).findFirst().orElseThrow();
        assertEquals(OtpChannel.Email, row.getChannel());
        assertEquals("new-reg@example.com", row.getTarget());
        assertEquals("new-reg@example.com", event(id).path("email").asText());
        String code = event(id).path("otpCode").asText();
        mvc.perform(post("/api/v1/auth/otp/verify").contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("phone_email", "+84911111111", "otp_code", code))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.access_token").isNotEmpty());
        User verified = users.findById(id).orElseThrow();
        assertEquals(UserStatus.Active, verified.getStatus());
        assertNotNull(verified.getEmailVerifiedAt());
        assertNull(verified.getPhoneVerifiedAt());
    }

    @Test
    void resendingOtpViaPhoneIdentifierStillDeliversToAccountEmail() throws Exception {
        mvc.perform(post("/api/v1/auth/otp/resend").contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("phone_email", "+84901234567"))))
                .andExpect(status().isOk());
        assertEquals(user.getEmail(), event(user.getId()).path("email").asText());
        assertEquals(user.getEmail(), otps.findAll().get(0).getTarget());
        assertEquals(OtpChannel.Email, otps.findAll().get(0).getChannel());
    }

    @Test
    void duplicateContactsReturn409IncludingCaseAndCountryCodeVariants() throws Exception {
        Map<String, Object> body = registration(); body.put("email", "CONTACT-TEST@EXAMPLE.COM");
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isConflict());
        body = registration(); body.put("phone", "+84901234567");
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isConflict());
        createUser("taken@example.com", "0981234567");
        request(Map.of("email", "TAKEN@EXAMPLE.COM"), 409);
        request(Map.of("phone", "+84981234567"), 409);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"email\":\"bad\"}", "{\"email\":\"a..b@example.com\"}",
            "{\"phone\":\"abc\"}", "{\"phone\":\"0123456789\"}", "{\"phone\":123}",
            "{\"email\":true}", "{\"email\":\"new@example.com\",\"phone\":\"0911111111\"}",
            "{\"email\":\"wrong@example.com\",\"new_email\":\"new@example.com\"}"})
    void rejectsInvalidOrAmbiguousContactBeforeCreatingOtp(String body) throws Exception {
        mvc.perform(post(CONTACT + "/otp").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        assertEquals(0, otps.count());
    }

    @Test
    void changesEmailWithDocumentedPayloadAndBindsOtpToDestination() throws Exception {
        request(Map.of("email", " New@Example.com "), 200);
        String code = event(user.getId()).path("otpCode").asText();
        assertEquals("new@example.com", event(user.getId()).path("email").asText());
        update(token, Map.of("email", "different@example.com", "otp_code", code), 400);
        update(token, Map.of("email", "new@example.com", "otp_code", code), 200);
        entityManager.flush(); entityManager.clear();
        User saved = users.findById(user.getId()).orElseThrow();
        assertEquals("new@example.com", saved.getEmail());
        assertNotNull(saved.getEmailVerifiedAt());
        assertEquals("0901234567", saved.getPhone());
        assertTrue(otps.findAll().get(0).getIsUsed());
    }

    @Test
    void phoneChangeQueuesOtpToVerifiedEmailAndDoesNotClaimPhoneOwnership() throws Exception {
        request(Map.of("phone", "+84911111111"), 200);
        JsonNode event = event(user.getId());
        assertEquals(user.getEmail(), event.path("email").asText());
        assertEquals("Change_Phone", event.path("purpose").asText());
        assertEquals("0911111111", otps.findAll().get(0).getTarget());
        assertEquals(OtpChannel.Email, otps.findAll().get(0).getChannel());
        update(token, Map.of("phone", "+84901234567", "new_phone", "0911111111", "otp_code", event.path("otpCode").asText()), 200);
        entityManager.flush(); entityManager.clear();
        User saved = users.findById(user.getId()).orElseThrow();
        assertEquals("0911111111", saved.getPhone());
        assertNull(saved.getPhoneVerifiedAt());
    }

    @Test
    void unverifiedEmailCannotAuthorizePhoneChange() throws Exception {
        user.setEmailVerifiedAt(null); users.saveAndFlush(user);
        request(Map.of("phone", "0911111111"), 400);
        assertEquals(0, otps.count());
    }

    @Test
    void rejectsExpiredWrongUserWrongPurposeAndMalformedOtp() throws Exception {
        request(Map.of("email", "new@example.com"), 200);
        String code = event(user.getId()).path("otpCode").asText();
        User other = createUser("other-contact@example.com", "0981234567");
        update(jwt.generateAccessToken(other.getId(), "Customer"), Map.of("email", "new@example.com", "otp_code", code), 400);
        update(token, Map.of("email", "new@example.com", "otp_code", "bad"), 400);
        OtpLog row = otps.findAll().get(0); row.setExpiresAt(LocalDateTime.now().minusMinutes(1)); otps.saveAndFlush(row);
        update(token, Map.of("email", "new@example.com", "otp_code", code), 400);
        String reset = otp.generateAndSaveOtp("other-new@example.com", OtpPurpose.Reset_Password, user.getId(), null);
        update(token, Map.of("email", "other-new@example.com", "otp_code", reset), 400);
    }

    @Test
    void cooldownAppliesAcrossDestinationsAndHourlyLimitCannotBeBypassed() throws Exception {
        request(Map.of("email", "new@example.com"), 200);
        request(Map.of("email", "other-new@example.com"), 429);
        for (int i = 0; i < 4; i++) otp.generateAndSaveOtp("target" + i + "@example.com", OtpPurpose.Change_Email, user.getId(), null);
        entityManager.createQuery("update OtpLog o set o.createdAt = :time where o.userId = :id")
                .setParameter("time", LocalDateTime.now().minusMinutes(2)).setParameter("id", user.getId()).executeUpdate();
        entityManager.clear();
        request(Map.of("email", "last@example.com"), 429);
        assertEquals(5, otps.count());
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void fifthFailureCommitsLockAndReturns429UntilNewOtpCanBeRequested() throws Exception {
        request(Map.of("email", "new@example.com"), 200);
        String correct = event(user.getId()).path("otpCode").asText();
        String wrong = correct.equals("000000") ? "000001" : "000000";
        for (int i = 0; i < 5; i++) update(token, Map.of("email", "new@example.com", "otp_code", wrong), i == 4 ? 429 : 400);
        assertEquals(5, otps.findAll().stream().filter(o -> user.getId().equals(o.getUserId())).findFirst().orElseThrow().getAttemptCount());
        update(token, Map.of("email", "new@example.com", "otp_code", correct), 429);
        assertEquals("contact-test@example.com", users.findById(user.getId()).orElseThrow().getEmail());
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void concurrentOtpRequestsShareUserLock() throws Exception {
        List<Integer> statuses = concurrently(
                () -> request(Map.of("email", "a@example.com")), () -> request(Map.of("email", "b@example.com")));
        assertEquals(List.of(200, 429), statuses);
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void concurrentAccountsCannotClaimTheSameEmail() throws Exception {
        User other = createUser("other-contact@example.com", "0981234567");
        String first = otp.generateAndSaveOtp("shared@example.com", OtpPurpose.Change_Email, user.getId(), null);
        String second = otp.generateAndSaveOtp("shared@example.com", OtpPurpose.Change_Email, other.getId(), null);
        String otherToken = jwt.generateAccessToken(other.getId(), "Customer");
        List<Integer> statuses = concurrently(
                () -> update(token, Map.of("email", "shared@example.com", "otp_code", first)),
                () -> update(otherToken, Map.of("email", "shared@example.com", "otp_code", second)));
        assertEquals(List.of(200, 409), statuses);
    }

    JsonNode event(String id) throws Exception {
        var row = outbox.findAll().stream().filter(e -> id.equals(e.getAggregateId()) && e.getEventType().equals(OtpEmailOutboxService.EVENT_TYPE))
                .max(Comparator.comparing(OutboxEvent::getId)).orElseThrow();
        return mapper.readTree(row.getPayload());
    }

    int request(Map<String, ?> body) throws Exception {
        return mvc.perform(post(CONTACT + "/otp").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andReturn().getResponse().getStatus();
    }
    void request(Map<String, ?> body, int status) throws Exception { assertEquals(status, request(body)); }
    int update(String accessToken, Map<String, ?> body) throws Exception {
        return mvc.perform(put(CONTACT).header("Authorization", "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andReturn().getResponse().getStatus();
    }
    void update(String accessToken, Map<String, ?> body, int status) throws Exception { assertEquals(status, update(accessToken, body)); }

    List<Integer> concurrently(Callable<Integer> first, Callable<Integer> second) throws Exception {
        var pool = Executors.newFixedThreadPool(2);
        var gate = new CountDownLatch(1);
        try {
            var one = pool.submit(() -> { gate.await(); return first.call(); });
            var two = pool.submit(() -> { gate.await(); return second.call(); });
            gate.countDown();
            var result = new ArrayList<>(List.of(one.get(20, TimeUnit.SECONDS), two.get(20, TimeUnit.SECONDS)));
            Collections.sort(result); return result;
        } finally { pool.shutdownNow(); }
    }
}
