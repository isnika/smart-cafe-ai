package com.smart_cafe_ai.identity_service.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.identity_service.model.*;
import com.smart_cafe_ai.identity_service.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
class UserStatusEventsTest {
    @Autowired AdminUserService admin;
    @Autowired ManagerStaffService staff;
    @Autowired UserRepository users;
    @Autowired RoleRepository roles;
    @Autowired OutboxEventRepository outbox;
    @Autowired ObjectMapper json;
    @Autowired AuthService auth;
    @Autowired OtpService otp;
    @Autowired PlatformTransactionManager transactions;

    private User account() {
        Role role = roles.findByName("Customer").orElseGet(() -> roles.save(Role.builder().name("Customer").build()));
        return users.save(User.builder().fullName("Status Test").role(role).status(UserStatus.Active)
                .email(UUID.randomUUID() + "@example.com").build());
    }

    private java.util.List<OutboxEvent> events(String user) {
        return outbox.findAll().stream().filter(e -> user.equals(e.getAggregateId())
                && UserStatusEvents.TYPES.contains(e.getEventType())).toList();
    }

    @Test void banDeactivateAndReactivateProduceOrderedEventsWithNoDuplicateForSameStatus() throws Exception {
        var user = account();
        admin.updateUserStatus(user.getId(), UserStatus.Banned);
        admin.updateUserStatus(user.getId(), UserStatus.Banned);
        staff.updateStaffStatus(user.getId(), UserStatus.Deactivated);
        admin.updateUserStatus(user.getId(), UserStatus.Active);
        var rows = events(user.getId());
        assertEquals(3, rows.size());
        assertEquals(java.util.List.of("identity.user.banned", "identity.user.deactivated", "identity.user.activated"),
                rows.stream().map(OutboxEvent::getEventType).toList());
        long previousRevision = 0;
        for (var row : rows) {
            var event = json.readTree(row.getPayload());
            assertEquals(row.getEventId(), event.path("event_id").asText());
            assertEquals(row.getEventType(), event.path("event_type").asText());
            assertEquals(1, event.path("event_version").asInt());
            assertEquals(user.getId(), event.path("user_id").asText());
            assertEquals(row.getId().longValue(), event.path("status_revision").asLong());
            assertTrue(event.path("status_revision").asLong() > previousRevision);
            previousRevision = event.path("status_revision").asLong();
            assertFalse(event.has("email"));
            assertFalse(event.has("password_hash"));
            assertDoesNotThrow(() -> java.time.Instant.parse(event.path("occurred_at").asText()));
        }
    }

    @Test void rollbackDoesNotPublishAStatusThatNeverCommitted() {
        var user = account();
        new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            admin.updateUserStatus(user.getId(), UserStatus.Banned);
            tx.setRollbackOnly();
        });
        assertEquals(UserStatus.Active, users.findById(user.getId()).orElseThrow().getStatus());
        assertTrue(events(user.getId()).isEmpty());
    }

    @Test void registrationVerificationPublishesActivationAfterUnverifiedStatus() throws Exception {
        var user = account();
        admin.updateUserStatus(user.getId(), UserStatus.Unverified);
        String code = otp.generateAndSaveOtp(user.getEmail(), OtpPurpose.Register, user.getId(), null);
        var response = auth.verifyOtp(new com.smart_cafe_ai.identity_service.dto.auth.VerifyOtpRequest(user.getEmail(), code));
        assertTrue(response.isSuccess());
        assertNotNull(response.getData().getAccessToken());
        var rows = events(user.getId());
        assertEquals(2, rows.size());
        assertEquals("identity.user.activated", rows.get(1).getEventType());
        assertEquals("Unverified", json.readTree(rows.get(1).getPayload()).path("previous_status").asText());
    }

    @Test void validRegistrationOtpDoesNotIssueTokenToBannedOrDeactivatedAccount() {
        for (var status : java.util.List.of(UserStatus.Banned, UserStatus.Deactivated)) {
            var user = account();
            String code = otp.generateAndSaveOtp(user.getEmail(), OtpPurpose.Register, user.getId(), null);
            admin.updateUserStatus(user.getId(), status);
            var response = auth.verifyOtp(new com.smart_cafe_ai.identity_service.dto.auth.VerifyOtpRequest(user.getEmail(), code));
            assertFalse(response.isSuccess());
            assertNull(response.getData());
            assertEquals(status == UserStatus.Banned ? "ACCOUNT_BANNED" : "ACCOUNT_DEACTIVATED", response.getError().getCode());
            assertEquals(status, users.findById(user.getId()).orElseThrow().getStatus());
        }
    }
}
