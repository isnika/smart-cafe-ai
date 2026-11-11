package com.smart_cafe_ai.catalog_service.validation;

import com.smart_cafe_ai.catalog_service.dto.product.*;
import com.smart_cafe_ai.catalog_service.exception.ApiException;
import com.smart_cafe_ai.catalog_service.model.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.*;
import static org.springframework.http.HttpStatus.*;

/** Normalize once, before persistence; the normalized values are also used for duplicate checks. */
public final class ProductValidation {
    private ProductValidation() {}

    public record Fields(Integer categoryId, String name, String image, String description, Temperature temperature,
                         CaffeineLevel caffeineLevel, List<String> flavorTags, int sortOrder, MenuStatus status) {}
    public record Variant(String name, BigDecimal price, int sortOrder, MenuStatus status) {}
    public record Option(String name, BigDecimal extraPrice, boolean defaultOption, int sortOrder, MenuStatus status) {}
    public record Group(String name, SelectionType selectionType, boolean required, int min, int max,
                        int sortOrder, List<Option> options) {}
    public record Children(List<Variant> variants, List<Group> groups) {}

    public static Fields fields(ProductRequest request) {
        if (request == null) invalid("Vui lòng nhập thông tin sản phẩm trước khi gửi.");
        if (request.getCategoryId() == null || request.getCategoryId() <= 0)
            invalid("Vui lòng chọn danh mục với mã là số nguyên dương.");
        String name = requiredName(request.getName(), "Tên sản phẩm", 100);
        if (request.getCaffeineLevel() == null) invalid("Vui lòng chọn mức caffeine của sản phẩm.");
        if (request.getStatus() == null) invalid("Vui lòng chọn trạng thái sản phẩm.");
        return new Fields(request.getCategoryId(), name, CategoryValidation.image(request.getImage()),
                description(request.getDescription()), request.getTemperature(), request.getCaffeineLevel(),
                tags(request.getFlavorTags()), order(request.getSortOrder()), request.getStatus());
    }

    public static String query(String value) { return text(value, "Từ khóa tìm kiếm", 100); }

    public static Children children(ProductCreateRequest request) {
        if (request.getVariants() == null || request.getOptionGroups() == null)
            invalid("Danh sách biến thể và nhóm tùy chọn phải là mảng JSON.");
        if (request.getVariants().size() > 100 || request.getOptionGroups().size() > 20)
            invalid("Mỗi lần tạo tối đa 100 biến thể và 20 nhóm tùy chọn.");
        var variants = new ArrayList<Variant>();
        Set<String> names = new HashSet<>();
        for (var item : request.getVariants()) {
            if (item == null) invalid("Thông tin biến thể không được để trống.");
            String name = requiredName(item.getVariantName(), "Tên biến thể", 50);
            unique(names, name, "Tên biến thể bị trùng trong cùng sản phẩm.");
            if (item.getStatus() == null) invalid("Vui lòng chọn trạng thái biến thể.");
            variants.add(new Variant(name, money(item.getPrice()), order(item.getSortOrder()), item.getStatus()));
        }
        var groups = new ArrayList<Group>();
        names.clear();
        for (var item : request.getOptionGroups()) {
            if (item == null) invalid("Thông tin nhóm tùy chọn không được để trống.");
            String name = requiredName(item.getName(), "Tên nhóm tùy chọn", 50);
            unique(names, name, "Tên nhóm tùy chọn bị trùng trong cùng sản phẩm.");
            if (item.getSelectionType() == null) invalid("Vui lòng chọn kiểu Single hoặc Multiple cho nhóm tùy chọn.");
            Integer min = item.getMinSelect(), max = item.getMaxSelect();
            if (min == null || max == null || min < 0 || max < 1 || min > max || max > 255)
                invalid("Số lựa chọn phải thỏa 0 ≤ min_select ≤ max_select ≤ 255 và max_select ≥ 1.");
            if (item.getSelectionType() == SelectionType.Single && max != 1)
                invalid("Nhóm Single chỉ được chọn tối đa một tùy chọn.");
            if (item.getRequired() == null) invalid("is_required phải là true hoặc false.");
            if (item.getRequired() && min < 1) invalid("Nhóm bắt buộc phải có min_select ít nhất bằng 1.");
            if (item.getOptions() == null || item.getOptions().size() > 100)
                invalid("Mỗi nhóm nhận một mảng tối đa 100 tùy chọn.");
            var options = new ArrayList<Option>();
            Set<String> optionNames = new HashSet<>();
            for (var option : item.getOptions()) {
                if (option == null) invalid("Thông tin tùy chọn không được để trống.");
                String optionName = requiredName(option.getOptionName(), "Tên tùy chọn", 100);
                unique(optionNames, optionName, "Tên tùy chọn bị trùng trong cùng nhóm.");
                if (option.getStatus() == null || option.getDefaultOption() == null)
                    invalid("Vui lòng kiểm tra trạng thái và tùy chọn mặc định.");
                options.add(new Option(optionName, money(option.getExtraPrice()), option.getDefaultOption(),
                        order(option.getSortOrder()), option.getStatus()));
            }
            groups.add(new Group(name, item.getSelectionType(), item.getRequired(), min, max,
                    order(item.getSortOrder()), List.copyOf(options)));
        }
        return new Children(List.copyOf(variants), List.copyOf(groups));
    }

    public static BigDecimal money(BigDecimal value) {
        if (value == null || value.signum() < 0 || value.stripTrailingZeros().scale() > 0 ||
                value.compareTo(new BigDecimal("999999999999999")) > 0)
            invalid("Giá phải là số nguyên VND không âm và không vượt quá 15 chữ số.");
        return value.setScale(0);
    }

    public static int order(Integer value) {
        if (value == null || value < 0) invalid("Thứ tự hiển thị phải là số nguyên không âm.");
        return value;
    }

    private static void unique(Set<String> names, String value, String message) {
        if (!names.add(VietnameseNameSearch.fold(value))) throw new ApiException(CONFLICT, "DUPLICATE_PRODUCT_CONFIGURATION", message);
    }

    public static String requiredName(String value, String label, int max) {
        String result = text(value, label, max);
        if (result == null) invalid("Vui lòng nhập " + label.toLowerCase(Locale.ROOT) + ".");
        return result;
    }

    private static String text(String value, String label, int max) {
        if (value == null) return null;
        if (value.codePoints().anyMatch(c -> Character.isISOControl(c) ||
                Character.getType(c) == Character.FORMAT || Character.getType(c) == Character.SURROGATE ||
                Character.getType(c) == Character.LINE_SEPARATOR || Character.getType(c) == Character.PARAGRAPH_SEPARATOR))
            invalid(label + " chứa ký tự không hợp lệ. Vui lòng nhập lại.");
        String result = Normalizer.normalize(value, Normalizer.Form.NFC).replaceAll("[\\p{Z}\\s]+", " ").strip();
        if (result.isEmpty()) return null;
        if (result.codePointCount(0, result.length()) > max) invalid(label + " không được vượt quá " + max + " ký tự.");
        return result;
    }

    private static List<String> tags(List<String> values) {
        if (values == null) return List.of();
        if (values.size() > 20) invalid("Mỗi sản phẩm có tối đa 20 nhãn hương vị.");
        Set<String> normalized = new LinkedHashSet<>();
        for (String value : values) {
            String tag = requiredName(value, "Nhãn hương vị", 30).toLowerCase(Locale.ROOT);
            if (tag.codePointCount(0, tag.length()) > 30) invalid("Nhãn hương vị không được vượt quá 30 ký tự.");
            normalized.add(tag);
        }
        return List.copyOf(normalized);
    }

    private static String description(String value) {
        if (value == null || value.isBlank()) return null;
        if (value.codePoints().anyMatch(c -> (Character.isISOControl(c) && c != '\n' && c != '\r' && c != '\t') ||
                Character.getType(c) == Character.FORMAT || Character.getType(c) == Character.SURROGATE))
            invalid("Mô tả sản phẩm chứa ký tự không hợp lệ.");
        String result = Normalizer.normalize(value, Normalizer.Form.NFC).strip();
        if (result.getBytes(StandardCharsets.UTF_8).length > 65535)
            invalid("Mô tả sản phẩm vượt quá dung lượng cho phép (65.535 byte UTF-8).");
        return result;
    }

    public static void invalid(String message) { throw new ApiException(BAD_REQUEST, "VALIDATION_ERROR", message); }
}
