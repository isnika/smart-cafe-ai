package com.smart_cafe_ai.catalog_service.dto.product;

import com.smart_cafe_ai.catalog_service.model.MenuStatus;
import com.smart_cafe_ai.catalog_service.validation.ProductValidation;
import org.springframework.data.domain.*;
import java.util.Map;

public record ProductAdminFilter(String q, Integer categoryId, MenuStatus status, String sort, int page, int size) {
    public ProductAdminFilter {
        q = ProductValidation.query(q);
        if (categoryId != null && categoryId <= 0) ProductValidation.invalid("Mã danh mục phải là số nguyên dương.");
        if (page < 1) ProductValidation.invalid("Số trang phải là số nguyên lớn hơn hoặc bằng 1.");
        if (size < 1 || size > 100) ProductValidation.invalid("Số mục trên mỗi trang phải là số nguyên từ 1 đến 100.");
        if ((long) (page - 1) * size > Integer.MAX_VALUE) ProductValidation.invalid("Số trang quá lớn. Vui lòng chọn một trang nhỏ hơn.");
        if (sort == null || sort.isBlank()) sort = "sort_order,asc";
        parseSort(sort);
    }
    public Pageable pageable() { return PageRequest.of(page - 1, size, parseSort(sort)); }
    private static Sort parseSort(String value) {
        var parts = value.split(",", -1);
        var allowed = Map.of("id", "id", "name", "name", "price", "price", "sort_order", "sortOrder",
                "status", "status", "created_at", "createdAt", "updated_at", "updatedAt");
        if (parts.length > 2 || !allowed.containsKey(parts[0]) ||
                (parts.length == 2 && !parts[1].equals("asc") && !parts[1].equals("desc")))
            ProductValidation.invalid("Lựa chọn sắp xếp sản phẩm không hợp lệ. Vui lòng chọn lại.");
        var sort = Sort.by(parts.length == 2 && parts[1].equals("desc") ? Sort.Direction.DESC : Sort.Direction.ASC,
                allowed.get(parts[0]));
        return parts[0].equals("id") ? sort : sort.and(Sort.by("id"));
    }
}
