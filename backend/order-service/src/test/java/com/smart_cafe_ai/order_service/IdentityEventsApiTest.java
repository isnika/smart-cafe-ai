package com.smart_cafe_ai.order_service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.smart_cafe_ai.order_service.integration.OrderDependencies;
import com.smart_cafe_ai.order_service.repository.*;
import com.smart_cafe_ai.order_service.service.*;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.*;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class IdentityEventsApiTest {
    @Autowired IdentityEventService service;
    @Autowired IdentityEventConsumer consumer;
    @Autowired IdentityUserStatusRepository statuses;
    @Autowired ProcessedEventRepository processed;
    @Autowired ObjectMapper json;
    @Autowired MockMvc mvc;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
    @MockBean OrderDependencies dependencies;
    @Value("${jwt.secret}") String secret;
    String user;

    @BeforeEach void setup() { user = UUID.randomUUID().toString(); }

    private String token(String role) {
        return "Bearer " + Jwts.builder().subject(user).claim("role", role)
                .expiration(Date.from(Instant.now().plusSeconds(600)))
                .signWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode(secret))).compact();
    }

    private ObjectNode event(String status, long revision) {
        String suffix = switch(status) { case "Active" -> "activated"; case "Banned" -> "banned";
            case "Deactivated" -> "deactivated"; default -> "status_changed"; };
        return json.createObjectNode().put("event_id", UUID.randomUUID().toString())
                .put("event_type", "identity.user." + suffix).put("event_version", 1)
                .put("user_id", user).put("status", status).put("status_revision", revision)
                .put("occurred_at", Instant.now().toString());
    }

    private void deliver(ObjectNode event) throws Exception {
        var props = new MessageProperties();
        props.setReceivedRoutingKey(event.path("event_type").asText());
        props.setType(event.path("event_type").asText());
        consumer.receive(new Message(json.writeValueAsBytes(event), props));
    }

    @Test void previouslyIssuedTokenIsDeniedAfterBanAndAllowedAfterReactivation() throws Exception {
        String jwt = token("Customer");
        mvc.perform(get("/api/v1/orders/me").header("Authorization", jwt)).andExpect(status().isOk());
        deliver(event("Banned", 1));
        mvc.perform(get("/api/v1/orders/me").header("Authorization", jwt))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("ACCOUNT_BANNED"));
        deliver(event("Active", 2));
        mvc.perform(get("/api/v1/orders/me").header("Authorization", jwt)).andExpect(status().isOk());
    }

    @Test void deactivatedStaffTokenCannotAccessOrderApis() throws Exception {
        deliver(event("Deactivated", 1));
        mvc.perform(get("/api/v1/orders").header("Authorization", token("Staff")))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("ACCOUNT_DEACTIVATED"));
    }

    @Test void duplicateAndLateEventsDoNotOverwriteNewerStatus() throws Exception {
        var banned = event("Banned", 10);
        deliver(banned);
        deliver(banned);
        deliver(event("Active", 12));
        deliver(event("Deactivated", 11));
        var row = statuses.findById(user).orElseThrow();
        assertEquals("Active", row.status);
        assertEquals(12, row.statusRevision);
        assertTrue(processed.existsById(banned.path("event_id").asText()));
    }

    @Test void invalidEventIsRejectedWithoutChangingProjectionOrProcessedMarker() throws Exception {
        var invalid = event("Banned", 1).put("status", "Active");
        assertThrows(AmqpRejectAndDontRequeueException.class, () -> deliver(invalid));
        assertFalse(statuses.existsById(user));
        assertFalse(processed.existsById(invalid.path("event_id").asText()));
        assertThrows(IllegalArgumentException.class, () -> service.accept("identity.user.activated", event("Banned", 1)));
    }

    @Test void projectionAndProcessedMarkerRollbackTogether() {
        var event = event("Banned", 1);
        new org.springframework.transaction.support.TransactionTemplate(transactions).executeWithoutResult(tx -> {
            service.accept(event.path("event_type").asText(), event);
            tx.setRollbackOnly();
        });
        assertFalse(statuses.existsById(user));
        assertFalse(processed.existsById(event.path("event_id").asText()));
    }
}
