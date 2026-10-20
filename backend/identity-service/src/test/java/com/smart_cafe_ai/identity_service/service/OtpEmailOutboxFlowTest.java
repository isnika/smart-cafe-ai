package com.smart_cafe_ai.identity_service.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.identity_service.dto.event.OtpEmailEvent;
import com.smart_cafe_ai.identity_service.model.OtpPurpose;
import com.smart_cafe_ai.identity_service.model.OutboxEvent;
import com.smart_cafe_ai.identity_service.repository.OtpLogRepository;
import com.smart_cafe_ai.identity_service.repository.OutboxEventRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.data.domain.PageRequest;
import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
class OtpEmailOutboxFlowTest {
    @Autowired OtpService otpService;
    @Autowired OtpLogRepository otpLogs;
    @Autowired OutboxEventRepository outbox;
    @Autowired ObjectMapper mapper;
    @Autowired PlatformTransactionManager transactionManager;

    @Test
    void emailOtpAndOutboxCommitTogetherWithoutRabbitConnection() throws Exception {
        long count = outbox.count();
        String code = otpService.generateAndSaveOtp(" Customer@Example.com ", OtpPurpose.Register, "user-1", null);
        assertEquals(count + 1, outbox.count());
        OutboxEvent row = outbox.findAll().stream().filter(e -> e.getPayload().contains(code)).findFirst().orElseThrow();
        OtpEmailEvent event = mapper.readValue(row.getPayload(), OtpEmailEvent.class);
        assertEquals("customer@example.com", event.email());
        assertEquals(code, event.otpCode());
        assertEquals("Register", event.purpose());
        assertEquals(OutboxEvent.OutboxStatus.Pending, row.getStatus());
        new TransactionTemplate(transactionManager).executeWithoutResult(status ->
                assertTrue(outbox.findReadyOtpEmails(OtpEmailOutboxService.EVENT_TYPE,
                        OutboxEvent.OutboxStatus.Pending, LocalDateTime.now(), PageRequest.of(0, 10))
                        .stream().anyMatch(ready -> ready.getEventId().equals(event.eventId()))));
        assertTrue(otpService.verifyOtp(event.email(), code, OtpPurpose.Register));
    }

    @Test
    void transactionRollbackAlsoRemovesEmailRequest() {
        long otpCount = otpLogs.count();
        long eventCount = outbox.count();
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            otpService.generateAndSaveOtp("rollback@example.com", OtpPurpose.Change_Email, "user-2", null);
            status.setRollbackOnly();
        });
        assertEquals(otpCount, otpLogs.count());
        assertEquals(eventCount, outbox.count());
    }

    @Test
    void phoneOtpStillWorksWithoutCreatingAnEmailRequest() {
        long count = outbox.count();
        String code = otpService.generateAndSaveOtp("0901234567", OtpPurpose.Register);
        assertEquals(count, outbox.count());
        assertTrue(otpService.verifyOtp("0901234567", code, OtpPurpose.Register));
    }
}
