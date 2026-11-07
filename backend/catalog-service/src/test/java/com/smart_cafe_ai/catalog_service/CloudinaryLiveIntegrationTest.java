package com.smart_cafe_ai.catalog_service;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import com.smart_cafe_ai.catalog_service.service.CloudinaryService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;

import static org.junit.jupiter.api.Assertions.*;

class CloudinaryLiveIntegrationTest {

    @Test
    void testLiveCloudinaryUploadAndUpdate() throws Exception {
        // Real credentials from .env
        String cloudName = "dri1spe3b";
        String apiKey = "798639994742186";
        String apiSecret = "q7yovPI-IPJgLKEdIFOAVYloSro";

        Cloudinary cloudinary = new Cloudinary(ObjectUtils.asMap(
                "cloud_name", cloudName,
                "api_key", apiKey,
                "api_secret", apiSecret,
                "secure", true
        ));

        CloudinaryService service = new CloudinaryService(cloudinary);

        // Create a 20x20 sample PNG image in memory
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(20, 20, BufferedImage.TYPE_INT_RGB), "png", bytes);
        MockMultipartFile file = new MockMultipartFile("file", "live-test-product.png", "image/png", bytes.toByteArray());

        // Upload to real Cloudinary
        CloudinaryService.UploadedImage uploaded = service.uploadImage(file, "smart-cafe/products/test");
        System.out.println("=== LIVE CLOUDINARY UPLOAD SUCCESS ===");
        System.out.println("Uploaded URL: " + uploaded.url());
        System.out.println("Public ID: " + uploaded.publicId());

        assertNotNull(uploaded.url());
        assertTrue(uploaded.url().startsWith("https://res.cloudinary.com/" + cloudName + "/image/upload/"));
        assertTrue(uploaded.publicId().startsWith("smart-cafe/products/test/"));

        // Verify ownedPublicId extractor recognizes the uploaded URL
        String recognizedId = service.ownedPublicId(uploaded.url(), "smart-cafe/products/test");
        assertEquals(uploaded.publicId(), recognizedId);

        // Clean up from Cloudinary
        service.deleteImage(uploaded.publicId());
        System.out.println("=== LIVE CLOUDINARY DELETE SUCCESS ===");
    }
}
