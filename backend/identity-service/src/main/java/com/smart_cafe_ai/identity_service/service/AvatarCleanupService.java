package com.smart_cafe_ai.identity_service.service;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.identity_service.model.OutboxEvent;
import com.smart_cafe_ai.identity_service.repository.OutboxEventRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/** Reuses the existing outbox table so failed Cloudinary deletions can be retried. */
@Service
public class AvatarCleanupService {
    public static final String EVENT_TYPE = "AvatarDeletionRequested";
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AvatarCleanupService.class);
    private final Cloudinary cloudinary;
    private final OutboxEventRepository repository;
    private final ObjectMapper mapper;
    @Value("${app.avatar.cleanup-enabled:true}") private boolean enabled = true;

    public AvatarCleanupService(Cloudinary cloudinary, OutboxEventRepository repository, ObjectMapper mapper) {
        this.cloudinary = cloudinary;
        this.repository = repository;
        this.mapper = mapper;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void enqueue(String publicId) {
        if (publicId == null) return;
        try {
            persist(publicId);
        } catch (Exception ex) {
            try { destroy(publicId); }
            catch (Exception cleanupFailure) { log.error("Avatar cleanup could not be queued or completed", cleanupFailure); }
        }
    }

    /** Old image deletion becomes visible atomically with the profile's database commit. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void enqueueOnCommit(String publicId) {
        if (publicId == null) return;
        try { persist(publicId); }
        catch (IOException ex) { throw new IllegalStateException("Could not queue avatar cleanup", ex); }
    }

    private void persist(String publicId) throws IOException {
        String eventId = UUID.randomUUID().toString();
        repository.saveAndFlush(OutboxEvent.builder().eventId(eventId).aggregateType("Avatar")
                .aggregateId(eventId).eventType(EVENT_TYPE)
                .payload(mapper.writeValueAsString(Map.of("public_id", publicId))).build());
    }

    @Scheduled(fixedDelayString = "${app.avatar.cleanup-delay-ms:10000}")
    @Transactional
    public void processPending() {
        if (!enabled) return;
        for (OutboxEvent row : repository.findReadyOtpEmails(EVENT_TYPE, OutboxEvent.OutboxStatus.Pending,
                LocalDateTime.now(), PageRequest.of(0, 10))) {
            try {
                String publicId = mapper.readTree(row.getPayload()).path("public_id").asText();
                if (!publicId.startsWith("smart-cafe/avatars/")) throw new IllegalArgumentException("Invalid managed avatar");
                destroy(publicId);
                row.setStatus(OutboxEvent.OutboxStatus.Published);
                row.setPublishedAt(LocalDateTime.now());
                row.setLastError(null);
                row.setPayload("{}");
            } catch (Exception ex) {
                row.setRetryCount(row.getRetryCount() + 1);
                row.setNextRetryAt(LocalDateTime.now().plusSeconds(Math.min(300, 5L * row.getRetryCount())));
                row.setLastError(ex.getClass().getSimpleName());
            }
            repository.save(row);
        }
    }

    private void destroy(String publicId) throws IOException {
        Map<?, ?> result = cloudinary.uploader().destroy(publicId,
                ObjectUtils.asMap("resource_type", "image", "invalidate", true));
        if (!"ok".equals(result.get("result")) && !"not found".equals(result.get("result"))) {
            throw new IOException("Cloudinary deletion not confirmed");
        }
    }
}
