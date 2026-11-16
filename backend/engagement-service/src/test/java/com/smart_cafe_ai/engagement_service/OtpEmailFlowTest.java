package com.smart_cafe_ai.engagement_service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.engagement_service.consumer.OtpEmailConsumer;
import com.smart_cafe_ai.engagement_service.dto.OtpEmailEvent;
import com.smart_cafe_ai.engagement_service.model.Notification;
import com.smart_cafe_ai.engagement_service.repository.NotificationRepository;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Properties;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
class OtpEmailFlowTest {
    @Autowired OtpEmailConsumer consumer;
    @Autowired NotificationRepository repository;
    @Autowired ObjectMapper objectMapper;
    @Autowired MockMvc mvc;
    @MockBean JavaMailSender mailSender;
    private MimeMessage mimeMessage;

    @BeforeEach
    void setUp() {
        repository.deleteAll();
        mimeMessage = new MimeMessage(Session.getInstance(new Properties()));
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);
    }

    @Test
    void consumesIndependentJsonContractSendsEmailAndDeduplicates() throws Exception {
        OtpEmailEvent event = event(Instant.now().plusSeconds(300));
        // No Java type header: services exchange JSON only.
        Message message = message(event);
        consumer.consume(message);
        consumer.consume(message);

        Notification row = repository.findByEventId(event.eventId()).orElseThrow();
        assertEquals(Notification.Status.SENT, row.getStatus());
        assertEquals(1, row.getAttemptCount());
        assertNotNull(row.getSentAt());
        assertEquals("OTP", row.getType());
        assertEquals(Notification.Channel.Email, row.getChannel());
        assertFalse(row.getTitle().isBlank());
        assertFalse(row.getBody().isBlank());
        assertFalse(row.isRead());
        assertFalse(row.getBody().contains(event.otpCode()));
        verify(mailSender, times(1)).send(any(MimeMessage.class));
        assertEquals("customer@example.com", mimeMessage.getAllRecipients()[0].toString());
        assertEquals("sender@example.com", mimeMessage.getFrom()[0].toString());
        assertTrue(mimeMessage.getSubject().contains("xác thực tài khoản"));
        assertTrue(mimeMessage.getContent().toString().contains("012345"));
    }

    @Test
    void passwordResetEventUsesExistingEmailDeliveryAndCorrectContent() throws Exception {
        OtpEmailEvent event = new OtpEmailEvent(UUID.randomUUID().toString(), "user-1", "customer@example.com",
                "012345", "Reset_Password", Instant.now().plusSeconds(300));
        consumer.consume(message(event));
        verify(mailSender).send(any(MimeMessage.class));
        assertEquals(Notification.Status.SENT, repository.findByEventId(event.eventId()).orElseThrow().getStatus());
        assertTrue(mimeMessage.getSubject().contains("đặt lại mật khẩu"));
        assertTrue(mimeMessage.getContent().toString().contains("012345"));
    }

    @Test
    void failureIsPersistedAndRedeliveryCanSucceed() throws Exception {
        OtpEmailEvent event = event(Instant.now().plusSeconds(300));
        doThrow(new MailSendException("SMTP unavailable")).doNothing()
                .when(mailSender).send(any(MimeMessage.class));

        assertThrows(IllegalStateException.class, () -> consumer.consume(message(event)));
        Notification failed = repository.findByEventId(event.eventId()).orElseThrow();
        assertEquals(Notification.Status.FAILED, failed.getStatus());
        assertEquals(1, failed.getAttemptCount());
        assertEquals("MailSendException", failed.getLastError());

        consumer.consume(message(event));
        Notification sent = repository.findByEventId(event.eventId()).orElseThrow();
        assertEquals(Notification.Status.SENT, sent.getStatus());
        assertEquals(2, sent.getAttemptCount());
        assertNull(sent.getLastError());
    }

    @Test
    void phoneChangeOtpUsesExistingEmailDelivery() throws Exception {
        OtpEmailEvent event = new OtpEmailEvent(UUID.randomUUID().toString(), "user-1", "customer@example.com",
                "012345", "Change_Phone", Instant.now().plusSeconds(300));
        consumer.consume(message(event));
        verify(mailSender).send(any(MimeMessage.class));
        assertEquals("customer@example.com", mimeMessage.getAllRecipients()[0].toString());
        assertEquals(Notification.Channel.Email, repository.findByEventId(event.eventId()).orElseThrow().getChannel());
        assertTrue(mimeMessage.getSubject().contains("đổi số điện thoại"));
    }

    @Test
    void expiredOtpIsNotSent() throws Exception {
        OtpEmailEvent event = event(Instant.now().minusSeconds(1));
        consumer.consume(message(event));
        assertEquals(Notification.Status.EXPIRED,
                repository.findByEventId(event.eventId()).orElseThrow().getStatus());
        verify(mailSender, never()).send(any(MimeMessage.class));
    }

    @Test
    void rejectsMalformedOrInvalidEventsWithoutSending() throws Exception {
        assertThrows(AmqpRejectAndDontRequeueException.class, () -> consumer.consume(
                new Message("not-json".getBytes(StandardCharsets.UTF_8), new MessageProperties())));
        OtpEmailEvent invalid = new OtpEmailEvent(UUID.randomUUID().toString(), null,
                "not-an-email", "bad-code", "Register", Instant.now().plusSeconds(300));
        assertThrows(AmqpRejectAndDontRequeueException.class, () -> consumer.consume(message(invalid)));
        assertEquals(0, repository.count());
        verify(mailSender, never()).send(any(MimeMessage.class));
    }

    @Test
    void statusEndpointRequiresTokenAndOmitsOtpAndRecipient() throws Exception {
        OtpEmailEvent event = event(Instant.now().plusSeconds(300));
        consumer.consume(message(event));
        String path = "/api/v1/internal/notifications/" + event.eventId();
        mvc.perform(get(path)).andExpect(status().isForbidden());
        mvc.perform(get(path).header("X-Internal-Token", "wrong")).andExpect(status().isForbidden());
        mvc.perform(get(path).header("X-Internal-Token", "test-internal-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SENT"))
                .andExpect(jsonPath("$.otpCode").doesNotExist())
                .andExpect(jsonPath("$.recipient").doesNotExist());
    }

    private OtpEmailEvent event(Instant expiresAt) {
        return new OtpEmailEvent(UUID.randomUUID().toString(), "user-1", "customer@example.com",
                "012345", "Register", expiresAt);
    }

    private Message message(OtpEmailEvent event) throws Exception {
        return new Message(objectMapper.writeValueAsBytes(event), new MessageProperties());
    }
}
