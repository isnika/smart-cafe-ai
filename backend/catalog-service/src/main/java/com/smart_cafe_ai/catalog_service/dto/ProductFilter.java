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
        if (q != null && q.length() > 100) invalid("q tối đa 100 ký tự");
        if (flavorTag != null && flavorTag.length() > 30) invalid("flavor_tag tối đa 30 ký tự");
        if (categoryId != null && categoryId <= 0) invalid("category_id phải lớn hơn 0");
        if (branchId != null && branchId <= 0) invalid("branch_id phải lớn hơn 0");
        if (page < 1 || size < 1 || size > 100) invalid("page >= 1; size từ 1 đến 100");
        for (BigDecimal price : new BigDecimal[]{minPrice, maxPrice}) {
            if (price != null && (price.signum() < 0 || price.stripTrailingZeros().scale() > 0
                    || price.compareTo(new BigDecimal("999999999999999")) > 0)) {
                invalid("Giá phải là số nguyên VND từ 0 đến 999999999999999");
            }
        }
        if (minPrice != null && maxPrice != null && minPrice.compareTo(maxPrice) > 0) {
            invalid("min_price không được lớn hơn max_price");
        }
        if (sort == null || sort.isBlank()) sort = "sort_order,asc";
        parseSort(sort);
        if ((long) (page - 1) * size > Integer.MAX_VALUE) invalid("page vượt giới hạn hỗ trợ");
    }

    public Pageable pageable() {
        return PageRequest.of(page - 1, size, parseSort(sort).and(Sort.by("id")));
    }

    private static Sort parseSort(String value) {
        String[] parts = value.split(",", -1);
        Map<String, String> fields = Map.of("name", "name", "price", "price", "sort_order", "sortOrder");
        if (parts.length > 2 || !fields.containsKey(parts[0])
                || (parts.length == 2 && !parts[1].equals("asc") && !parts[1].equals("desc"))) {
            invalid("sort phải có dạng name|price|sort_order[,asc|desc]");
        }
        return Sort.by(parts.length == 2 && parts[1].equals("desc") ? Sort.Direction.DESC : Sort.Direction.ASC,
                fields.get(parts[0]));
    }

    private static void invalid(String message) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message);
    }
}

