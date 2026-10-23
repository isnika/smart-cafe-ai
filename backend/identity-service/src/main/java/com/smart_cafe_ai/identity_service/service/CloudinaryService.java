package com.smart_cafe_ai.identity_service.service;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import com.smart_cafe_ai.identity_service.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.util.Map;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.util.Locale;
import java.util.UUID;

@Service
public class CloudinaryService {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(CloudinaryService.class);
    private static final long MAX_BYTES = 5L * 1024 * 1024;
    private final Cloudinary cloudinary;
    private final AvatarCleanupService cleanup;

    public record UploadedImage(String url, String publicId) { }

    public CloudinaryService(Cloudinary cloudinary, AvatarCleanupService cleanup) {
        this.cloudinary = cloudinary;
        this.cleanup = cleanup;
    }

    public UploadedImage uploadImage(MultipartFile file, String folder) {
        byte[] bytes = validateImage(file);
        String publicId = folder + "/" + UUID.randomUUID();
        try {
            Map<?, ?> result = cloudinary.uploader().upload(bytes, ObjectUtils.asMap(
                    "public_id", publicId, "resource_type", "image", "overwrite", false));
            Object rawUrl = result.get("secure_url");
            String url = rawUrl instanceof String value ? value : null;
            URI uri = url == null ? null : URI.create(url);
            if (uri == null || !"https".equals(uri.getScheme()) || uri.getHost() == null || url.length() > 255
                    || !publicId.equals(result.get("public_id"))) {
                throw new IOException("Cloudinary response missing valid image metadata");
            }
            return new UploadedImage(url, publicId);
        } catch (IOException | RuntimeException ex) {
            enqueueDeletion(publicId);
            throw new ApiException(HttpStatus.BAD_GATEWAY, "AVATAR_UPLOAD_FAILED", "Không thể tải ảnh lên kho lưu trữ, vui lòng thử lại sau");
        }
    }

    private byte[] validateImage(MultipartFile file) {
        if (file == null || file.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Vui lòng chọn file ảnh");
        if (file.getSize() > MAX_BYTES) throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE", "Ảnh đại diện không được vượt quá 5 MB");
        try {
            byte[] bytes = file.getBytes();
            try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
                var readers = ImageIO.getImageReaders(input);
                if (!readers.hasNext()) throw new IOException("Not an image");
                ImageReader reader = readers.next();
                try {
                    reader.setInput(input);
                    String format = reader.getFormatName().toLowerCase(Locale.ROOT);
                    String expectedType = switch (format) {
                        case "png" -> "image/png";
                        case "jpeg", "jpg" -> "image/jpeg";
                        default -> throw new IOException("Unsupported image format");
                    };
                    String type = file.getContentType();
                    if (type != null && !expectedType.equalsIgnoreCase(type)) throw new IOException("Image MIME mismatch");
                    int width = reader.getWidth(0), height = reader.getHeight(0);
                    if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
                        throw new ApiException(HttpStatus.BAD_REQUEST, "IMAGE_DIMENSIONS_INVALID", "Kích thước ảnh tối đa 4096 × 4096 pixel");
                    }
                    if (reader.read(0) == null) throw new IOException("Corrupt image");
                } finally { reader.dispose(); }
            }
            return bytes;
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_IMAGE", "Chỉ chấp nhận ảnh JPEG hoặc PNG có nội dung hợp lệ và đúng MIME type");
        }
    }

    public void enqueueDeletion(String publicId) {
        if (publicId == null) return;
        try { cleanup.enqueue(publicId); }
        catch (RuntimeException ex) { log.error("Avatar cleanup transaction failed", ex); }
    }

    public void enqueueDeletionOnCommit(String publicId) {
        if (publicId != null) cleanup.enqueueOnCommit(publicId);
    }

    /** Delete only images in this account's managed folder, never arbitrary user-supplied URLs. */
    public String ownedPublicId(String url, String folder) {
        if (url == null) return null;
        try {
            URI uri = URI.create(url);
            String prefix = "/" + cloudinary.config.cloudName + "/image/upload/";
            if (!"https".equals(uri.getScheme()) || !"res.cloudinary.com".equals(uri.getHost())
                    || !uri.getPath().startsWith(prefix)) return null;
            String path = uri.getPath().substring(prefix.length()).replaceFirst("^v[0-9]+/", "");
            int dot = path.lastIndexOf('.');
            if (dot > 0) path = path.substring(0, dot);
            return path.startsWith(folder + "/") && path.substring(folder.length() + 1).matches("[0-9a-f-]{36}") ? path : null;
        } catch (IllegalArgumentException ex) { return null; }
    }
}

