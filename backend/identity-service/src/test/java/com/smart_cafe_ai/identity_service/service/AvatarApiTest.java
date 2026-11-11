package com.smart_cafe_ai.identity_service.service;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import com.smart_cafe_ai.identity_service.model.*;
import com.smart_cafe_ai.identity_service.repository.*;
import com.smart_cafe_ai.identity_service.security.JwtService;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AvatarApiTest {
    @Autowired MockMvc mvc;
    @SpyBean UserRepository users;
    @Autowired RoleRepository roles;
    @Autowired OutboxEventRepository outbox;
    @Autowired JwtService jwt;
    @SpyBean Cloudinary cloudinary;
    @Autowired CloudinaryService images;
    @MockBean GoogleTokenVerifierService google;
    Uploader uploader;
    User user;
    String token, oldId, oldUrl;

    @BeforeEach
    void setUp() throws Exception {
        uploader = mock(Uploader.class);
        doReturn(uploader).when(cloudinary).uploader();
        when(uploader.upload(any(byte[].class), anyMap())).thenAnswer(inv -> {
            Map<?, ?> options = inv.getArgument(1);
            String id = options.get("public_id").toString();
            assertEquals("image", options.get("resource_type"));
            return Map.of("public_id", id, "secure_url", "https://res.cloudinary.com/test/image/upload/v1/" + id + ".png");
        });
        Role role = roles.findByName("Customer").orElseGet(() -> roles.save(Role.builder().name("Customer").build()));
        user = users.saveAndFlush(User.builder().email("avatar-test@example.com").phone("0901234567")
                .fullName("Avatar Test").passwordHash("test-hash").role(role).status(UserStatus.Active).build());
        oldId = "smart-cafe/avatars/" + user.getId() + "/11111111-1111-1111-1111-111111111111";
        oldUrl = "https://res.cloudinary.com/test/image/upload/v1/" + oldId + ".png";
        user.setAvatar(oldUrl); users.saveAndFlush(user);
        token = jwt.generateAccessToken(user.getId(), "Customer");
    }

    @AfterEach
    void cleanUp() {
        outbox.deleteAll(outbox.findAll().stream().filter(e -> e.getPayload().contains(user.getId())).toList());
        users.deleteById(user.getId());
    }

    static MockMultipartFile png(int width, int height) throws IOException {
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", bytes);
        return new MockMultipartFile("file", "avatar.png", "image/png", bytes.toByteArray());
    }

    @Test
    void savesAvatarAndQueuesOldImageOnlyAfterDatabaseCommit() throws Exception {
        mvc.perform(multipart("/api/v1/users/me/avatar").file(png(2, 2)).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.avatar").isString());
        assertNotEquals(oldUrl, users.findById(user.getId()).orElseThrow().getAvatar());
        assertEquals(1, cleanupRows().size());
        assertTrue(cleanupRows().get(0).getPayload().contains(oldId));
        verify(uploader, never()).destroy(anyString(), anyMap());
    }

    @ParameterizedTest
    @ValueSource(strings = {"application/pdf", "video/mp4", "image/png"})
    void rejectsNonImageContentEvenWithAnImageMime(String type) throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "fake.png", type, "%PDF-1.7 fake file".getBytes());
        mvc.perform(multipart("/api/v1/users/me/avatar").file(file).header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("INVALID_IMAGE"));
        assertUnchanged(); verify(uploader, never()).upload(any(), anyMap());
    }

    @Test
    void rejectsOversizeImageWith413BeforeUpload() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "large.png", "image/png", new byte[5 * 1024 * 1024 + 1]);
        mvc.perform(multipart("/api/v1/users/me/avatar").file(file).header("Authorization", "Bearer " + token))
                .andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.error.code").value("FILE_TOO_LARGE"));
        assertUnchanged(); verify(uploader, never()).upload(any(), anyMap());
    }

    @Test
    void rejectsOversizedDimensionsWithoutUploading() throws Exception {
        mvc.perform(multipart("/api/v1/users/me/avatar").file(png(4097, 1)).header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("IMAGE_DIMENSIONS_INVALID"));
        assertUnchanged(); verify(uploader, never()).upload(any(), anyMap());
    }

    @Test
    void missingFileAndMissingAuthenticationAreReported() throws Exception {
        mvc.perform(multipart("/api/v1/users/me/avatar").header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/v1/users/me/avatar").file(png(1, 1))).andExpect(status().isUnauthorized());
        assertUnchanged();
    }

    @Test
    void providerFailureIs502AndDoesNotChangeProfile() throws Exception {
        when(uploader.upload(any(byte[].class), anyMap())).thenThrow(new IOException("provider unavailable"));
        mvc.perform(multipart("/api/v1/users/me/avatar").file(png(1, 1)).header("Authorization", "Bearer " + token))
                .andExpect(status().isBadGateway()).andExpect(jsonPath("$.error.code").value("AVATAR_UPLOAD_FAILED"));
        assertUnchanged();
        assertEquals(1, cleanupRows().size());
        assertFalse(cleanupRows().get(0).getPayload().contains(oldId));
    }

    @Test
    void incompleteProviderResponseIsRejectedAndNewImageIsQueuedForCleanup() throws Exception {
        when(uploader.upload(any(byte[].class), anyMap())).thenReturn(Map.of("secure_url", "http://invalid"));
        mvc.perform(multipart("/api/v1/users/me/avatar").file(png(1, 1)).header("Authorization", "Bearer " + token))
                .andExpect(status().isBadGateway());
        assertUnchanged(); assertEquals(1, cleanupRows().size());
    }

    @Test
    void databaseRollbackPreservesOldAvatarAndQueuesNewImage() throws Exception {
        doThrow(new DataIntegrityViolationException("simulated database error")).when(users).saveAndFlush(any(User.class));
        mvc.perform(multipart("/api/v1/users/me/avatar").file(png(1, 1)).header("Authorization", "Bearer " + token))
                .andExpect(status().isConflict());
        assertUnchanged();
        assertEquals(1, cleanupRows().size());
        assertFalse(cleanupRows().get(0).getPayload().contains(oldId));
    }

    @Test
    void imageCleanupCannotTargetOtherAccountsOrExternalUrls() {
        String folder = "smart-cafe/avatars/" + user.getId();
        assertEquals(oldId, images.ownedPublicId(oldUrl, folder));
        assertNull(images.ownedPublicId(oldUrl.replace(user.getId(), "another-user"), folder));
        assertNull(images.ownedPublicId(oldUrl.replace("res.cloudinary.com", "attacker.example"), folder));
    }

    List<OutboxEvent> cleanupRows() {
        return outbox.findAll().stream().filter(e -> e.getEventType().equals(AvatarCleanupService.EVENT_TYPE)
                && e.getPayload().contains(user.getId())).toList();
    }
    void assertUnchanged() { assertEquals(oldUrl, users.findById(user.getId()).orElseThrow().getAvatar()); }
}
