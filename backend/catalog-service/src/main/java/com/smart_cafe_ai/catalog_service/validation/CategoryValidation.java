package com.smart_cafe_ai.catalog_service.validation;

import com.smart_cafe_ai.catalog_service.dto.category.CategoryRequest;
import com.smart_cafe_ai.catalog_service.exception.ApiException;
import org.springframework.http.HttpStatus;
import java.net.URI;
import java.net.URISyntaxException;
import java.text.Normalizer;

public final class CategoryValidation {
    private CategoryValidation() {}

    public static String name(String value) {
        String normalized = text(value, "name", 100);
        if (normalized == null) invalid("Vui lòng nhập tên danh mục.");
        return normalized;
    }

    public static String query(String value) {
        return text(value, "q", 100);
    }

    private static String text(String value, String field, int max) {
        if (value == null) return null;
        if (value.codePoints().anyMatch(c -> Character.isISOControl(c) ||
                Character.getType(c) == Character.FORMAT ||
                Character.getType(c) == Character.SURROGATE ||
                Character.getType(c) == Character.LINE_SEPARATOR ||
                Character.getType(c) == Character.PARAGRAPH_SEPARATOR)) {
            invalid(label(field) + " chứa ký tự không hợp lệ. Vui lòng nhập lại.");
        }
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFC)
                .replaceAll("[\\p{Z}\\s]+", " ").strip();
        if (normalized.isEmpty()) return null;
        if (normalized.codePointCount(0, normalized.length()) > max)
            invalid(label(field) + " không được vượt quá " + max + " ký tự.");
        return normalized;
    }

    public static String image(String value) {
        if (value == null || value.isBlank()) return null;
        String url = value.strip();
        if (url.length() > 255) invalid("Đường dẫn ảnh không được vượt quá 255 ký tự.");
        try {
            URI uri = new URI(url);
            if (!( "https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) ||
                    uri.getHost() == null || uri.getUserInfo() != null ||
                    (uri.getPort() != -1 && (uri.getPort() < 1 || uri.getPort() > 65535))) {
                invalid("Đường dẫn ảnh không hợp lệ. Vui lòng sử dụng liên kết HTTP hoặc HTTPS.");
            }
        } catch (URISyntaxException ex) {
            invalid("Đường dẫn ảnh không hợp lệ. Vui lòng sử dụng liên kết HTTP hoặc HTTPS.");
        }
        return url;
    }

    public static void fields(CategoryRequest request) {
        if (request == null) invalid("Vui lòng nhập thông tin danh mục trước khi gửi.");
        if (request.getSortOrder() == null || request.getSortOrder() < 0)
            invalid("Thứ tự hiển thị phải là số nguyên không âm.");
        if (request.getStatus() == null) invalid("Vui lòng chọn trạng thái danh mục.");
    }

    private static String label(String field) {
        return field.equals("name") ? "Tên danh mục" : "Từ khóa tìm kiếm";
    }

    public static void invalid(String message) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message);
    }
}

