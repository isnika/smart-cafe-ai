package com.smart_cafe_ai.identity_service.service;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.identity_service.model.OutboxEvent;
import com.smart_cafe_ai.identity_service.repository.OutboxEventRepository;
import org.junit.jupiter.api.Test;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AvatarCleanupServiceTest {
    @Test
    void failedDeletionRemainsPendingAndRetryCanSucceed() throws Exception {
        Cloudinary cloudinary = mock(Cloudinary.class);
        Uploader uploader = mock(Uploader.class);
        OutboxEventRepository repository = mock(OutboxEventRepository.class);
        when(cloudinary.uploader()).thenReturn(uploader);
        var service = new AvatarCleanupService(cloudinary, repository, new ObjectMapper());
        OutboxEvent row = OutboxEvent.builder().payload("{\"public_id\":\"smart-cafe/avatars/user/image\"}").build();
        when(repository.findReadyOtpEmails(eq(AvatarCleanupService.EVENT_TYPE), eq(OutboxEvent.OutboxStatus.Pending), any(), any()))
                .thenReturn(List.of(row));
        when(uploader.destroy(anyString(), anyMap())).thenThrow(new IOException("offline")).thenReturn(Map.of("result", "not found"));
        service.processPending();
        assertEquals(OutboxEvent.OutboxStatus.Pending, row.getStatus());
        assertEquals(1, row.getRetryCount());
        assertNotNull(row.getNextRetryAt());
        service.processPending();
        assertEquals(OutboxEvent.OutboxStatus.Published, row.getStatus());
        assertEquals("{}", row.getPayload());
    }
}
