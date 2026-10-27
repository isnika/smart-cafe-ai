package com.smart_cafe_ai.catalog_service.service;

import com.smart_cafe_ai.catalog_service.dto.ApiResponse;
import com.smart_cafe_ai.catalog_service.dto.product.*;
import com.smart_cafe_ai.catalog_service.exception.ApiException;
import com.smart_cafe_ai.catalog_service.model.*;
import com.smart_cafe_ai.catalog_service.repository.*;
import com.smart_cafe_ai.catalog_service.security.CatalogActor;
import com.smart_cafe_ai.catalog_service.validation.ProductValidation;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import java.sql.SQLException;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import static org.springframework.http.HttpStatus.*;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProductAdminService {
    private final ProductRepository products;
    private final CategoryRepository categories;
    private final ProductVariantRepository variants;
    private final ProductOptionGroupRepository groups;
    private final ProductOptionRepository options;
    private final AuditLogRepository audits;
    private final OutboxEventRepository outbox;
    private final EntityManager entityManager;

    public ApiResponse<List<ProductAdminResponse>> list(ProductAdminFilter filter) {
        var page = products.findAll(ProductAdminSpecifications.list(filter), filter.pageable());
        var data = responses(page.getContent());
        String message = null;
        if (data.isEmpty()) {
            if (page.getTotalElements() > 0) message = "Trang này chưa có sản phẩm. Bạn hãy chọn trang trước.";
            else if (filter.q() != null || filter.status() != null || filter.categoryId() != null)
                message = "Không tìm thấy sản phẩm phù hợp. Bạn hãy thử thay đổi bộ lọc.";
            else message = "Chưa có sản phẩm nào. Bạn có thể tạo sản phẩm mới.";
        }
        return ApiResponse.success(data, new ApiResponse.PageMeta(filter.page(), filter.size(),
                page.getTotalElements(), page.getTotalPages()), message);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ApiResponse<ProductAdminResponse.Detail> create(ProductCreateRequest request, CatalogActor actor) {
        var fields = ProductValidation.fields(request);
        var children = ProductValidation.children(request);
        try {
            return create(fields, children, actor);
        } catch (DataIntegrityViolationException ex) {
            for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
                if (cause instanceof SQLException sql && (sql.getErrorCode() == 1062 || "23505".equals(sql.getSQLState())))
                    throw new ApiException(CONFLICT, "DUPLICATE_PRODUCT_CONFIGURATION",
                            "Tên biến thể, nhóm tùy chọn hoặc tùy chọn bị trùng theo quy tắc database. Vui lòng chọn tên khác.");
            }
            throw ex;
        }
    }

    private ApiResponse<ProductAdminResponse.Detail> create(ProductValidation.Fields fields,
            ProductValidation.Children children, CatalogActor actor) {
        // Prevent the category from being deleted while creating its product.
        Category category = categoryLocked(fields.categoryId());
        Product product = new Product(category, fields.name(), fields.image(), fields.description(), fields.temperature(),
                fields.caffeineLevel(), fields.flavorTags(), fields.sortOrder(), fields.status());
        products.saveAndFlush(product);
        var createdVariants = children.variants().stream().map(v -> variants.save(new ProductVariant(product.getId(),
                v.name(), v.price(), v.sortOrder(), v.status()))).toList();
        var createdGroups = new ArrayList<ProductAdminResponse.Group>();
        for (var item : children.groups()) {
            var group = groups.save(new ProductOptionGroup(product.getId(), item.name(), item.selectionType(),
                    item.required(), item.min(), item.max(), item.sortOrder()));
            var createdOptions = item.options().stream().map(o -> options.save(new ProductOption(group.getId(), o.name(),
                    o.extraPrice(), o.defaultOption(), o.sortOrder(), o.status()))).map(o -> new ProductAdminResponse.Option(
                            o.getId(), o.getOptionName(), o.getExtraPrice(), o.isDefaultOption(), o.getSortOrder(), o.getStatus()))
                    .sorted(Comparator.comparingInt(ProductAdminResponse.Option::sortOrder).thenComparing(ProductAdminResponse.Option::id)).toList();
            createdGroups.add(new ProductAdminResponse.Group(group.getId(), group.getName(), group.getSelectionType(),
                    group.isRequired(), group.getMinSelect(), group.getMaxSelect(), group.getSortOrder(), createdOptions));
        }
        entityManager.flush();
        entityManager.refresh(product); // Reload formula prices after inserting variants in this transaction.
        var detail = new ProductAdminResponse.Detail(responses(List.of(product)).get(0),
                createdVariants.stream().map(v -> new ProductAdminResponse.Variant(v.getId(), v.getVariantName(), v.getPrice(),
                        v.getSortOrder(), v.getStatus())).sorted(Comparator.comparingInt(ProductAdminResponse.Variant::sortOrder)
                        .thenComparing(ProductAdminResponse.Variant::id)).toList(),
                createdGroups.stream().sorted(Comparator.comparingInt(ProductAdminResponse.Group::sortOrder)
                        .thenComparing(ProductAdminResponse.Group::id)).toList());
        var after = snapshot(product);
        after.put("variants", detail.variants());
        after.put("option_groups", detail.optionGroups());
        audit(actor, "PRODUCT_CREATED", product.getId(), null, after);
        return ApiResponse.success(detail, availabilityMessage("Tạo sản phẩm thành công.", detail.product()));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ApiResponse<ProductAdminResponse> update(Integer id, ProductRequest request, CatalogActor actor) {
        var fields = ProductValidation.fields(request);
        Category category = categoryLocked(fields.categoryId());
        Product product = locked(id);
        var before = snapshot(product);
        MenuStatus oldStatus = product.getStatus();
        product.replace(category, fields.name(), fields.image(), fields.description(), fields.temperature(),
                fields.caffeineLevel(), fields.flavorTags(), fields.sortOrder(), fields.status());
        var after = snapshot(product);
        boolean changed = !before.equals(after);
        if (changed) {
            products.flush();
            audit(actor, "PRODUCT_UPDATED", id, before, after);
            if (oldStatus != product.getStatus()) outbox.save(OutboxEvent.productStatusChanged(product));
        }
        var response = responses(List.of(product)).get(0);
        return ApiResponse.success(response, changed ? availabilityMessage("Cập nhật sản phẩm thành công.", response)
                : "Thông tin sản phẩm không thay đổi.");
    }

    @Transactional
    public ApiResponse<ProductAdminResponse.Status> status(Integer id, MenuStatus status, CatalogActor actor) {
        if (status == null) ProductValidation.invalid("Vui lòng chọn trạng thái sản phẩm.");
        Product product = locked(id);
        boolean changed = product.getStatus() != status;
        if (changed) {
            var before = snapshot(product);
            product.changeStatus(status);
            products.flush();
            audit(actor, "PRODUCT_STATUS_CHANGED", id, before, snapshot(product));
            outbox.save(OutboxEvent.productStatusChanged(product));
        }
        String message = changed ? (status == MenuStatus.Active ? "Kích hoạt sản phẩm thành công."
                : "Đã ngừng hiển thị sản phẩm trên thực đơn.") : (status == MenuStatus.Active
                ? "Sản phẩm đã ở trạng thái Active." : "Sản phẩm đã ở trạng thái Inactive.");
        if (status == MenuStatus.Active) message = availabilityMessage(message, responses(List.of(product)).get(0));
        return ApiResponse.success(new ProductAdminResponse.Status(id, product.getStatus(), product.getUpdatedAt()), message);
    }

    @Transactional
    public ApiResponse<ProductAdminResponse.Deleted> delete(Integer id, CatalogActor actor) {
        Product product = locked(id);
        // A variant can be referenced by Orders/Inventory across services. Never cascade-delete it.
        if (variants.existsByProductId(id) || groups.existsByProductId(id)) throw inUse();
        var before = snapshot(product);
        try {
            products.delete(product);
            products.flush();
        } catch (DataIntegrityViolationException ex) {
            for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
                if (cause instanceof SQLException sql && (sql.getErrorCode() == 1451 ||
                        "23503".equals(sql.getSQLState()) || "23506".equals(sql.getSQLState()))) throw inUse();
            }
            throw ex;
        }
        audit(actor, "PRODUCT_DELETED", id, before, null);
        return ApiResponse.success(new ProductAdminResponse.Deleted(id), "Xóa sản phẩm thành công.");
    }

    private Product locked(Integer id) {
        return products.findByIdForUpdate(id).orElseThrow(() -> new ApiException(NOT_FOUND, "NOT_FOUND",
                "Không tìm thấy sản phẩm bạn muốn thao tác. Vui lòng kiểm tra lại."));
    }

    private Category categoryLocked(Integer id) {
        return categories.findByIdForUpdate(id).orElseThrow(() -> new ApiException(NOT_FOUND, "NOT_FOUND",
                "Danh mục đã chọn không tồn tại. Vui lòng chọn danh mục khác."));
    }

    private ApiException inUse() {
        return new ApiException(CONFLICT, "PRODUCT_IN_USE",
                "Không thể xóa sản phẩm vì đã có biến thể, nhóm tùy chọn hoặc dữ liệu liên kết cần bảo toàn, kể cả dữ liệu Inactive. " +
                        "Vui lòng chuyển sản phẩm sang Inactive để ngừng hiển thị.");
    }

    private void audit(CatalogActor actor, String action, Integer id, Map<String, Object> before, Map<String, Object> after) {
        audits.save(new AuditLog(actor, action, "Product", id, before, after));
    }

    private Map<String, Object> snapshot(Product p) {
        var value = new LinkedHashMap<String, Object>();
        value.put("category_id", p.getCategory().getId());
        value.put("name", p.getName()); value.put("image", p.getImage()); value.put("description", p.getDescription());
        value.put("temperature", p.getTemperature()); value.put("caffeine_level", p.getCaffeineLevel());
        value.put("flavor_tags", p.getFlavorTags() == null ? List.of() : List.copyOf(p.getFlavorTags()));
        value.put("sort_order", p.getSortOrder()); value.put("status", p.getStatus());
        return value;
    }

    private List<ProductAdminResponse> responses(List<Product> rows) {
        if (rows.isEmpty()) return List.of();
        var ids = rows.stream().map(Product::getId).toList();
        var variantCounts = variants.countByProductIds(ids, MenuStatus.Active).stream()
                .collect(Collectors.toMap(ProductVariantRepository.Counts::getProductId, Function.identity()));
        var groupCounts = groups.countByProductIds(ids).stream()
                .collect(Collectors.toMap(ProductOptionGroupRepository.Counts::getProductId, ProductOptionGroupRepository.Counts::getTotal));
        return rows.stream().map(p -> {
            var count = variantCounts.get(p.getId());
            long active = count == null ? 0 : count.getActive();
            return new ProductAdminResponse(p.getId(), p.getCategory().getId(), p.getCategory().getName(), p.getCategory().getStatus(),
                    p.getName(), p.getImage(), p.getDescription(), p.getTemperature(), p.getCaffeineLevel(),
                    p.getFlavorTags() == null ? List.of() : p.getFlavorTags(), p.getSortOrder(), p.getStatus(), p.getPrice(), p.getMaxPrice(),
                    p.getStatus() == MenuStatus.Active && p.getCategory().getStatus() == MenuStatus.Active && active > 0,
                    count == null ? 0 : count.getTotal(), active, groupCounts.getOrDefault(p.getId(), 0L),
                    p.getCreatedAt(), p.getUpdatedAt());
        }).toList();
    }

    private String availabilityMessage(String message, ProductAdminResponse response) {
        if (response.status() != MenuStatus.Active) return message;
        if (response.categoryStatus() != MenuStatus.Active)
            return message + " Danh mục đang Inactive nên sản phẩm chưa hiển thị trên thực đơn.";
        if (response.activeVariantCount() == 0)
            return message + " Sản phẩm chưa có biến thể Active nên chưa thể bán.";
        return message;
    }
}
