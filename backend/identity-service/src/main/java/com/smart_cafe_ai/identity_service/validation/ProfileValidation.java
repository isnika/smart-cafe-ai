package com.smart_cafe_ai.identity_service.validation;

import com.smart_cafe_ai.identity_service.dto.ApiResponse;
import java.text.Normalizer;
import java.net.URI;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Shared rules for registration and personal contact changes. */
public final class ProfileValidation {
    private static final Pattern NAME = Pattern.compile("\\p{L}[\\p{L}\\p{M}]*(?:[ '\u2019-]\\p{L}[\\p{L}\\p{M}]*)*");
    private static final String ATOM = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+";
    private static final String LABEL = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?";
    private static final Pattern EMAIL = Pattern.compile(ATOM + "(?:\\." + ATOM + ")*@" + LABEL + "(?:\\." + LABEL + ")+");

    private ProfileValidation() { }

    public static boolean hasText(String value) { return value != null && !value.isBlank(); }

    public static String normalizeEmail(String value) {
        if (value == null) return null;
        String email = value.strip().toLowerCase(Locale.ROOT);
        return email.length() <= 100 && email.indexOf('@') <= 64 && EMAIL.matcher(email).matches() ? email : null;
    }

    /** Vietnamese mobile numbers: 03/05/07/08/09, ten digits; +84 is stored as 0. */
    public static String normalizePhone(String value) {
        if (value == null) return null;
        String phone = value.strip();
        if (phone.startsWith("+84")) phone = "0" + phone.substring(3);
        return phone.matches("0[35789][0-9]{8}") ? phone : null;
    }

    public static List<String> phoneAliases(String phone) {
        return List.of(phone, "+84" + phone.substring(1));
    }

    public static String normalizeAvatarUrl(String value) {
        if (value == null) return null;
        String url = value.strip();
        try {
            URI uri = URI.create(url);
            return url.length() <= 255 && "https".equals(uri.getScheme()) && uri.getHost() != null
                    && uri.getUserInfo() == null && uri.getFragment() == null ? url : null;
        } catch (IllegalArgumentException ex) { return null; }
    }

    public static ApiResponse<String> validateFullName(String value) {
        if (value == null) return ApiResponse.error("VALIDATION_ERROR", "full_name là bắt buộc và không được để trống");
        if (value.codePoints().anyMatch(c -> Character.isISOControl(c) || Character.getType(c) == Character.FORMAT
                || Character.getType(c) == Character.LINE_SEPARATOR || Character.getType(c) == Character.PARAGRAPH_SEPARATOR)) {
            return ApiResponse.error("VALIDATION_ERROR", "full_name không được chứa xuống dòng, tab hoặc ký tự điều khiển/ẩn");
        }
        String name = Normalizer.normalize(value, Normalizer.Form.NFC).replaceAll("\\p{Zs}+", " ").strip();
        if (!hasText(name)) return ApiResponse.error("VALIDATION_ERROR", "full_name là bắt buộc và không được để trống");
        if (name.codePointCount(0, name.length()) > 100) return ApiResponse.error("VALIDATION_ERROR",
                "full_name không được vượt quá 100 ký tự sau khi chuẩn hóa khoảng trắng và dấu Unicode");
        if (!NAME.matcher(name).matches()) return ApiResponse.error("VALIDATION_ERROR",
                "full_name chỉ được chứa chữ cái (có thể có dấu), khoảng trắng, gạch nối (-) hoặc nháy đơn ('/’); "
                        + "các dấu phải nằm giữa hai phần tên và không được liên tiếp; không chứa số, emoji hoặc ký tự đặc biệt khác");
        return ApiResponse.success(name);
    }
}
