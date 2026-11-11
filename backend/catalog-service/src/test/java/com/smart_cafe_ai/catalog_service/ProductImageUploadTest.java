package com.smart_cafe_ai.catalog_service;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.catalog_service.model.Product;
import com.smart_cafe_ai.catalog_service.repository.AuditLogRepository;
import com.smart_cafe_ai.catalog_service.repository.ProductRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.MockMvc;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Map;

import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Sql(scripts = {"/catalog-cleanup.sql", "/catalog-fixture.sql"}, executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(scripts = "/catalog-cleanup.sql", executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class ProductImageUploadTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired ProductRepository products;
    @Autowired AuditLogRepository audits;
    @SpyBean Cloudinary cloudinary;

    Uploader uploader;

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
        when(uploader.destroy(anyString(), anyMap())).thenReturn(Map.of("result", "ok"));
    }

    private static MockMultipartFile validImage(String paramName, int width, int height) throws IOException {
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", bytes);
        return new MockMultipartFile(paramName, "test.png", "image/png", bytes.toByteArray());
    }

    @Test
    void uploadProductImage_success_withBothAliasesAndParams() throws Exception {
        for (String prefix : java.util.List.of("/catalog", "/api/v1/catalog")) {
            MockMultipartFile file = validImage("file", 100, 100);
            mvc.perform(multipart(prefix + "/products/1/image")
                            .file(file)
                            .header("Authorization", CategoryAdminApiTest.token("Manager")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.id").value(1))
                    .andExpect(jsonPath("$.data.image", startsWith("https://res.cloudinary.com/test/image/upload/v1/smart-cafe/products/")));

            Product updated = products.findById(1).orElseThrow();
            assertNotNull(updated.getImage());
            assertTrue(updated.getImage().contains("smart-cafe/products/"));

            // Verify audit log
            var logs = audits.findAll().stream().filter(a -> "1".equals(a.getEntityId())).toList();
            assertFalse(logs.isEmpty());
        }
    }

    @Test
    void uploadProductImage_replacesOldManagedCloudinaryImage() throws Exception {
        Product product = products.findById(1).orElseThrow();
        String oldPublicId = "smart-cafe/products/11111111-1111-1111-1111-111111111111";
        product.updateImage("https://res.cloudinary.com/test/image/upload/v1/" + oldPublicId + ".png");
        products.saveAndFlush(product);

        MockMultipartFile file = validImage("file", 50, 50);
        mvc.perform(multipart("/catalog/products/1/image")
                        .file(file)
                        .header("Authorization", CategoryAdminApiTest.token("Manager")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        verify(uploader, atLeastOnce()).destroy(eq(oldPublicId), anyMap());
    }

    @Test
    void uploadProductImage_doesNotDestroyExternalUrl() throws Exception {
        Product product = products.findById(1).orElseThrow();
        product.updateImage("https://images.unsplash.com/photo-1234.jpg");
        products.saveAndFlush(product);

        MockMultipartFile file = validImage("image", 50, 50);
        mvc.perform(multipart("/catalog/products/1/image")
                        .file(file)
                        .header("Authorization", CategoryAdminApiTest.token("Manager")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        verify(uploader, never()).destroy(anyString(), anyMap());
    }

    @Test
    void deleteProductImage_clearsImageAndDeletesFromCloudinary() throws Exception {
        Product product = products.findById(1).orElseThrow();
        String oldPublicId = "smart-cafe/products/22222222-2222-2222-2222-222222222222";
        product.updateImage("https://res.cloudinary.com/test/image/upload/v1/" + oldPublicId + ".png");
        products.saveAndFlush(product);

        mvc.perform(delete("/catalog/products/1/image")
                        .header("Authorization", CategoryAdminApiTest.token("Manager")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.image").value(nullValue()));

        Product updated = products.findById(1).orElseThrow();
        assertNull(updated.getImage());
        verify(uploader, atLeastOnce()).destroy(eq(oldPublicId), anyMap());
    }

    @Test
    void uploadStandaloneImage_returnsImageUrlAndPublicId() throws Exception {
        MockMultipartFile file = validImage("file", 64, 64);
        mvc.perform(multipart("/catalog/images")
                        .file(file)
                        .header("Authorization", CategoryAdminApiTest.token("Manager")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.image_url", startsWith("https://res.cloudinary.com/test/image/upload/v1/smart-cafe/products/")))
                .andExpect(jsonPath("$.data.public_id", startsWith("smart-cafe/products/")));
    }

    @Test
    void uploadProductImage_rejectsEmptyFile_400() throws Exception {
        MockMultipartFile emptyFile = new MockMultipartFile("file", "empty.png", "image/png", new byte[0]);
        mvc.perform(multipart("/catalog/products/1/image")
                        .file(emptyFile)
                        .header("Authorization", CategoryAdminApiTest.token("Manager")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"application/pdf", "text/plain", "image/png"})
    void uploadProductImage_rejectsNonImageContent_400(String contentType) throws Exception {
        MockMultipartFile badFile = new MockMultipartFile("file", "bad.png", contentType, "Not real image data".getBytes());
        mvc.perform(multipart("/catalog/products/1/image")
                        .file(badFile)
                        .header("Authorization", CategoryAdminApiTest.token("Manager")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_IMAGE"));

        verify(uploader, never()).upload(any(byte[].class), anyMap());
    }

    @Test
    void uploadProductImage_rejectsOversize_413() throws Exception {
        MockMultipartFile largeFile = new MockMultipartFile("file", "large.png", "image/png", new byte[5 * 1024 * 1024 + 1]);
        mvc.perform(multipart("/catalog/products/1/image")
                        .file(largeFile)
                        .header("Authorization", CategoryAdminApiTest.token("Manager")))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.error.code").value("FILE_TOO_LARGE"));

        verify(uploader, never()).upload(any(byte[].class), anyMap());
    }

    @Test
    void uploadProductImage_requiresAuthentication() throws Exception {
        MockMultipartFile file = validImage("file", 10, 10);
        mvc.perform(multipart("/catalog/products/1/image").file(file))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @Test
    void uploadProductImage_requiresManagerRole() throws Exception {
        MockMultipartFile file = validImage("file", 10, 10);
        mvc.perform(multipart("/catalog/products/1/image")
                        .file(file)
                        .header("Authorization", CategoryAdminApiTest.token("Customer")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @Test
    void uploadProductImage_returns404ForNonExistentProduct() throws Exception {
        MockMultipartFile file = validImage("file", 10, 10);
        mvc.perform(multipart("/catalog/products/99999/image")
                        .file(file)
                        .header("Authorization", CategoryAdminApiTest.token("Manager")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }
}
