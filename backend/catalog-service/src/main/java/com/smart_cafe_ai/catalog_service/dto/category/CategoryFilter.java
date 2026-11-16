package com.smart_cafe_ai.catalog_service.dto.category;

import com.smart_cafe_ai.catalog_service.model.MenuStatus;
import com.smart_cafe_ai.catalog_service.validation.CategoryValidation;
import org.springframework.data.domain.*;
import java.util.Map;

public record CategoryFilter(String q, MenuStatus status, String sort, int page, int size) {
    public CategoryFilter {
        q = CategoryValidation.query(q);
        if (page < 1) CategoryValidation.invalid("Số trang phải là số nguyên lớn hơn hoặc bằng 1.");
        if (size < 1 || size > 100) CategoryValidation.invalid("Số mục trên mỗi trang phải là số nguyên từ 1 đến 100.");
        if ((long) (page - 1) * size > Integer.MAX_VALUE)
            CategoryValidation.invalid("Số trang quá lớn. Vui lòng chọn một trang nhỏ hơn.");
        if (sort == null || sort.isBlank()) sort = "sort_order,asc";
        parseSort(sort);
    }

    public Pageable pageable() {
        return PageRequest.of(page - 1, size, parseSort(sort));
    }

    private static Sort parseSort(String value) {
        String[] parts = value.split(",", -1);
        Map<String, String> allowed = Map.of("id", "id", "name", "name", "sort_order", "sortOrder", "status", "status");
        if (parts.length > 2 || !allowed.containsKey(parts[0]) ||
                (parts.length == 2 && !parts[1].equals("asc") && !parts[1].equals("desc"))) {
            CategoryValidation.invalid("Lựa chọn sắp xếp danh mục không hợp lệ. Vui lòng chọn lại.");
        }
        var order = Sort.by(parts.length == 2 && parts[1].equals("desc") ? Sort.Direction.DESC : Sort.Direction.ASC,
                allowed.get(parts[0]));
        return parts[0].equals("id") ? order : order.and(Sort.by("id"));
    }
}

