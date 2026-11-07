package com.smart_cafe_ai.catalog_service.service;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import com.smart_cafe_ai.catalog_service.exception.ApiException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URI;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
@Slf4j
public class CloudinaryService {
    private static final long MAX_BYTES = 5L * 1024 * 1024; // 5 MB
    private final Cloudinary cloudinary;

    public record UploadedImage(String url, String publicId) {}

    public CloudinaryService(Cloudinary cloudinary) {
        this.cloudinary = cloudinary;
    }

    public UploadedImage uploadImage(MultipartFile file, String folder) {
        byte[] bytes = validateImage(file);
        String publicId = folder + "/" + UUID.randomUUID();
        try {
            Map<?, ?> result = cloudinary.uploader().upload(bytes, ObjectUtils.asMap(
                    "public_id", publicId,
                    "resource_type", "image",
                    "overwrite", false
            ));
            Object rawUrl = result.get("secure_url");
            String url = rawUrl instanceof String value ? value : null;
            URI uri = url == null ? null : URI.create(url);
            if (uri == null || !"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || url.length() > 255
                    || !publicId.equals(result.get("public_id"))) {
                throw new IOException("Cloudinary response missing valid image metadata");
            }
            return new UploadedImage(url, publicId);
        } catch (IOException | RuntimeException ex) {
            log.error("Cloudinary upload failed for publicId={}: {}", publicId, ex.getMessage());
            deleteImage(publicId);
            throw new ApiException(HttpStatus.BAD_GATEWAY, "IMAGE_UPLOAD_FAILED",
                    "Không thể tải ảnh lên kho lưu trữ Cloudinary, vui lòng thử lại sau.");
        }
    }

    public void deleteImage(String publicId) {
        if (publicId == null || publicId.isBlank()) return;
        try {
            Map<?, ?> result = cloudinary.uploader().destroy(publicId,
                    ObjectUtils.asMap("resource_type", "image", "invalidate", true));
            log.info("Cloudinary destroy publicId={}, result={}", publicId, result.get("result"));
        } catch (Exception ex) {
            log.warn("Failed to delete image from Cloudinary for publicId={}: {}", publicId, ex.getMessage());
        }
    }

    public void deleteImageOnCommit(String publicId) {
        if (publicId == null || publicId.isBlank()) return;
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    deleteImage(publicId);
                }
            });
        } else {
            deleteImage(publicId);
        }
    }

    public void deleteImageOnRollback(String publicId) {
        if (publicId == null || publicId.isBlank()) return;
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    if (status == STATUS_ROLLED_BACK) {
                        deleteImage(publicId);
                    }
                }
            });
        }
    }

    /**
     * Delete only images in this account's managed folder, never arbitrary user-supplied URLs.
     */
    public String ownedPublicId(String url, String folder) {
        if (url == null || url.isBlank()) return null;
        try {
            URI uri = URI.create(url);
            String prefix = "/" + cloudinary.config.cloudName + "/image/upload/";
            if (!"https".equalsIgnoreCase(uri.getScheme()) || !"res.cloudinary.com".equalsIgnoreCase(uri.getHost())
                    || !uri.getPath().startsWith(prefix)) {
                return null;
            }
            String path = uri.getPath().substring(prefix.length()).replaceFirst("^v[0-9]+/", "");
            int dot = path.lastIndexOf('.');
            if (dot > 0) path = path.substring(0, dot);
            if (path.startsWith(folder + "/") && path.substring(folder.length() + 1).matches("[0-9a-f-]{36}")) {
                return path;
            }
            return null;
        } catch (Exception ex) {
            return null;
        }
    }

    public byte[] validateImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Vui lòng chọn file ảnh tải lên.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE", "Ảnh sản phẩm không được vượt quá 5 MB.");
        }
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
                    if (type != null && !expectedType.equalsIgnoreCase(type)) {
                        throw new IOException("Image MIME mismatch");
                    }
                    int width = reader.getWidth(0), height = reader.getHeight(0);
                    if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
                        throw new ApiException(HttpStatus.BAD_REQUEST, "IMAGE_DIMENSIONS_INVALID",
                                "Kích thước ảnh tối đa 4096 × 4096 pixel.");
                    }
                    if (reader.read(0) == null) throw new IOException("Corrupt image");
                } finally {
                    reader.dispose();
                }
            }
            return bytes;
        } catch (ApiException ex) {
            throw ex;
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_IMAGE",
                    "Chỉ chấp nhận ảnh JPEG hoặc PNG có nội dung hợp lệ và đúng MIME type.");
        }
    }
}
