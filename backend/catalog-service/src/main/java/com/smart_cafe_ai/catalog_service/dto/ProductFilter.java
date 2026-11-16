package com.smart_cafe_ai.catalog_service.dto;

import com.smart_cafe_ai.catalog_service.exception.ApiException;
import com.smart_cafe_ai.catalog_service.model.*;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import java.math.BigDecimal;
import java.util.Locale;
import java.util.Map;

public record ProductFilter(String q, Integer categoryId, Integer branchId, Temperature temperature,
        CaffeineLevel caffeineLevel, String flavorTag, BigDecimal minPrice, BigDecimal maxPrice,
        String sort, int page, int size) {

    public ProductFilter {
        q = q == null || q.isBlank() ? null : q.strip();
        flavorTag = flavorTag == null || flavorTag.isBlank() ? null : flavorTag.strip().toLowerCase(Locale.ROOT);
        if (q != null && q.length() > 100) invalid("Từ khóa tìm kiếm không được vượt quá 100 ký tự.");
        if (flavorTag != null && flavorTag.length() > 30) invalid("Từ khóa hương vị không được vượt quá 30 ký tự.");
        if (categoryId != null && categoryId <= 0) invalid("Mã danh mục phải là số nguyên dương.");
        if (branchId != null && branchId <= 0) invalid("Mã chi nhánh phải là số nguyên dương.");
        if (page < 1) invalid("Số trang phải là số nguyên lớn hơn hoặc bằng 1.");
        if (size < 1 || size > 100) invalid("Số mục trên mỗi trang phải là số nguyên từ 1 đến 100.");
        for (BigDecimal price : new BigDecimal[]{minPrice, maxPrice}) {
            if (price != null && (price.signum() < 0 || price.stripTrailingZeros().scale() > 0
                    || price.compareTo(new BigDecimal("999999999999999")) > 0)) {
                invalid("Giá phải là số nguyên VND không âm và không vượt quá 15 chữ số.");
            }
        }
        if (minPrice != null && maxPrice != null && minPrice.compareTo(maxPrice) > 0) {
            invalid("Giá thấp nhất không được lớn hơn giá cao nhất.");
        }
        if (sort == null || sort.isBlank()) sort = "sort_order,asc";
        parseSort(sort);
        if ((long) (page - 1) * size > Integer.MAX_VALUE)
            invalid("Số trang quá lớn. Vui lòng chọn một trang nhỏ hơn.");
    }

    public Pageable pageable() {
        return PageRequest.of(page - 1, size, parseSort(sort).and(Sort.by("id")));
    }

    private static Sort parseSort(String value) {
        String[] parts = value.split(",", -1);
        Map<String, String> fields = Map.of("name", "name", "price", "price", "sort_order", "sortOrder");
        if (parts.length > 2 || !fields.containsKey(parts[0])
                || (parts.length == 2 && !parts[1].equals("asc") && !parts[1].equals("desc"))) {
            invalid("Lựa chọn sắp xếp sản phẩm không hợp lệ. Vui lòng chọn lại.");
        }
        return Sort.by(parts.length == 2 && parts[1].equals("desc") ? Sort.Direction.DESC : Sort.Direction.ASC,
                fields.get(parts[0]));
    }

    private static void invalid(String message) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message);
    }
}

