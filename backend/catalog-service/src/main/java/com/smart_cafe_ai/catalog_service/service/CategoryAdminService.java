package com.smart_cafe_ai.catalog_service.service;

import com.smart_cafe_ai.catalog_service.dto.*;
import com.smart_cafe_ai.catalog_service.dto.CatalogResponse.*;
import com.smart_cafe_ai.catalog_service.dto.category.*;
import com.smart_cafe_ai.catalog_service.exception.ApiException;
import com.smart_cafe_ai.catalog_service.model.*;
import com.smart_cafe_ai.catalog_service.repository.*;
import com.smart_cafe_ai.catalog_service.security.CatalogActor;
import com.smart_cafe_ai.catalog_service.validation.CategoryValidation;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.sql.SQLException;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CategoryAdminService {
    private final CategoryRepository categories;
    private final ProductRepository products;
    private final AuditLogRepository audits;

    public ApiResponse<List<CategoryAdminResponse>> list(CategoryFilter filter) {
        var page = categories.findAll(CategorySpecifications.adminList(filter), filter.pageable());
        var ids = page.getContent().stream().map(Category::getId).toList();
        Map<Integer, ProductRepository.CategoryCounts> counts = ids.isEmpty() ? Map.of() :
                products.countByCategoryIds(ids, MenuStatus.Active).stream()
                        .collect(Collectors.toMap(ProductRepository.CategoryCounts::getCategoryId,
                                java.util.function.Function.identity()));
        var data = page.getContent().stream().map(c -> {
            var count = counts.get(c.getId());
            return new CategoryAdminResponse(c.getId(), c.getName(), c.getImage(), c.getSortOrder(), c.getStatus(),
                    count == null ? 0 : count.getTotalProductCount(),
                    count == null ? 0 : count.getActiveProductCount());
        }).toList();
        String message = null;
        if (data.isEmpty()) {
            if (page.getTotalElements() > 0) message = "Trang này chưa có danh mục. Bạn hãy chọn trang trước.";
            else if (filter.q() != null || filter.status() != null)
                message = "Không tìm thấy danh mục phù hợp. Bạn hãy thử thay đổi bộ lọc.";
            else message = "Chưa có danh mục nào. Bạn có thể tạo danh mục mới.";
        }
        return ApiResponse.success(data, new ApiResponse.PageMeta(filter.page(), filter.size(),
                page.getTotalElements(), page.getTotalPages()), message);
    }

    @Transactional
    public ApiResponse<CategoryResponse> create(CategoryRequest request, CatalogActor actor) {
        CategoryValidation.fields(request);
        String name = CategoryValidation.name(request.getName());
        String image = CategoryValidation.image(request.getImage());
        ensureUnique(name, null);
        Category category = new Category(name, image, request.getSortOrder(), request.getStatus());
        save(category);
        audits.save(new AuditLog(actor, "CATEGORY_CREATED", category.getId(), null, snapshot(category)));
        return ApiResponse.success(response(category, 0), "Tạo danh mục thành công.");
    }

    @Transactional
    public ApiResponse<CategoryResponse> update(Integer id, CategoryRequest request, CatalogActor actor) {
        CategoryValidation.fields(request);
        String name = CategoryValidation.name(request.getName());
        String image = CategoryValidation.image(request.getImage());
        Category category = locked(id);
        ensureUnique(name, id);
        var before = snapshot(category);
        // PUT replaces editable fields. Omitted fields use the documented request defaults.
        category.replace(name, image, request.getSortOrder(), request.getStatus());
        var after = snapshot(category);
        boolean changed = !before.equals(after);
        if (changed) {
            save(category);
            audits.save(new AuditLog(actor, "CATEGORY_UPDATED", id, before, after));
        }
        return ApiResponse.success(response(category, products.countByCategoryIdAndStatus(id, MenuStatus.Active)),
                changed ? "Cập nhật danh mục thành công." : "Thông tin danh mục không thay đổi.");
    }

    @Transactional
    public ApiResponse<CategoryStatusResponse> status(Integer id, MenuStatus status, CatalogActor actor) {
        if (status == null) CategoryValidation.invalid("Vui lòng chọn trạng thái danh mục.");
        Category category = locked(id);
        boolean changed = category.getStatus() != status;
        if (changed) {
            var before = snapshot(category);
            category.changeStatus(status);
            save(category);
            audits.save(new AuditLog(actor, "CATEGORY_STATUS_CHANGED", id, before, snapshot(category)));
        }
        // Do not cascade status changes to Products or delete related menu records.
        String message;
        if (changed) message = status == MenuStatus.Active ? "Kích hoạt danh mục thành công."
                : "Đã ngừng hiển thị danh mục và các sản phẩm thuộc danh mục trên thực đơn.";
        else message = status == MenuStatus.Active ? "Danh mục đã ở trạng thái đang hiển thị."
                : "Danh mục đã ở trạng thái ngừng hiển thị.";
        return ApiResponse.success(new CategoryStatusResponse(id, category.getStatus()), message);
    }

    @Transactional
    public ApiResponse<CategoryDeletedResponse> delete(Integer id, CatalogActor actor) {
        Category category = locked(id);
        // Inactive products still carry business history and must also prevent deletion.
        if (products.existsByCategoryId(id)) {
            throw new ApiException(HttpStatus.CONFLICT, "CATEGORY_IN_USE",
                    "Không thể xóa danh mục vì vẫn còn sản phẩm liên kết, kể cả sản phẩm đã ngừng bán. " +
                    "Vui lòng chuyển danh mục sang Inactive để ngừng hiển thị.");
        }
        var before = snapshot(category);
        try {
            // The parent row lock and RESTRICT FK protect against concurrent product inserts.
            // Flush before returning so DB dependency conflicts become a friendly HTTP 409.
            categories.delete(category);
            categories.flush();
        } catch (DataIntegrityViolationException ex) {
            for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
                if (cause instanceof SQLException sql && (sql.getErrorCode() == 1451 ||
                        "23503".equals(sql.getSQLState()) || "23506".equals(sql.getSQLState()))) {
                    throw new ApiException(HttpStatus.CONFLICT, "CATEGORY_IN_USE",
                            "Không thể xóa danh mục vì vẫn còn dữ liệu liên kết cần bảo toàn. " +
                            "Vui lòng chuyển danh mục sang Inactive để ngừng hiển thị.");
                }
            }
            throw ex;
        }
        // Audit_Logs deliberately keeps the old category ID without a foreign key.
        // If audit persistence fails, the category deletion is rolled back as well.
        audits.save(new AuditLog(actor, "CATEGORY_DELETED", id, before, null));
        return ApiResponse.success(new CategoryDeletedResponse(id), "Xóa danh mục thành công.");
    }

    private Category locked(Integer id) {
        return categories.findByIdForUpdate(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND",
                        "Không tìm thấy danh mục bạn muốn thao tác. Vui lòng kiểm tra lại."));
    }

    private void ensureUnique(String name, Integer id) {
        boolean duplicate = id == null ? categories.existsByNameIgnoreCase(name)
                : categories.existsByNameIgnoreCaseAndIdNot(name, id);
        if (duplicate) throw duplicateName();
    }

    private void save(Category category) {
        try {
            // Flush inside the transaction so a concurrent duplicate insert maps to HTTP 409.
            categories.saveAndFlush(category);
        } catch (DataIntegrityViolationException ex) {
            for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
                if (cause instanceof SQLException sql &&
                        (sql.getErrorCode() == 1062 || "23505".equals(sql.getSQLState()))) {
                    throw duplicateName();
                }
            }
            throw ex;
        }
    }

    private ApiException duplicateName() {
        return new ApiException(HttpStatus.CONFLICT, "CATEGORY_NAME_EXISTS",
                "Tên danh mục này đã được sử dụng. Vui lòng chọn tên khác. Nếu danh mục đang ngừng hiển thị, bạn có thể kích hoạt lại.");
    }

    private CategoryResponse response(Category c, long productCount) {
        return new CategoryResponse(c.getId(), c.getName(), c.getImage(), c.getSortOrder(), c.getStatus(), productCount);
    }

    private Map<String, Object> snapshot(Category c) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("name", c.getName());
        values.put("image", c.getImage());
        values.put("sort_order", c.getSortOrder());
        values.put("status", c.getStatus().name());
        return values;
    }
}

