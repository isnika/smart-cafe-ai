package com.smart_cafe_ai.catalog_service.service;

import com.smart_cafe_ai.catalog_service.dto.*;
import com.smart_cafe_ai.catalog_service.dto.CatalogResponse.*;
import com.smart_cafe_ai.catalog_service.exception.ApiException;
import com.smart_cafe_ai.catalog_service.model.*;
import com.smart_cafe_ai.catalog_service.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CatalogService {
    private final CategoryRepository categories;
    private final ProductRepository products;
    private final ProductVariantRepository variants;
    private final ProductOptionGroupRepository groups;
    private final ProductOptionRepository options;
    private final BranchProductAvailabilityRepository branchVariants;
    private final BranchOptionAvailabilityRepository branchOptions;
    private final com.smart_cafe_ai.catalog_service.integration.StoreBranchVerifier store;

    public List<CategoryResponse> categories(MenuStatus status) {
        return categories.findMenuCategories(status, MenuStatus.Active);
    }

    public ApiResponse<List<ProductResponse>> products(ProductFilter filter) {
        if(filter.branchId()!=null) store.requireExists(filter.branchId());
        var page = products.findAll(ProductSpecifications.publicMenu(filter), filter.pageable());
        var productIds = page.getContent().stream().map(Product::getId).toList();
        List<ProductVariant> activeVariants = productIds.isEmpty() ? List.of()
                : variants.findByProductIdInAndStatusOrderBySortOrderAscIdAsc(productIds, MenuStatus.Active);
        var availability = variantAvailability(filter.branchId(), activeVariants);
        var sellableIds = activeVariants.stream().filter(v -> isAvailable(v.getId(), availability))
                .map(ProductVariant::getProductId).collect(Collectors.toSet());
        var data = page.getContent().stream().map(p -> productResponse(p, sellableIds.contains(p.getId()))).toList();
        String message = data.isEmpty() ? (page.getTotalElements() > 0
                ? "Trang này chưa có sản phẩm. Bạn hãy chọn trang trước."
                : "Hiện chưa có sản phẩm phù hợp để hiển thị.") : null;
        return ApiResponse.success(data, new ApiResponse.PageMeta(filter.page(), filter.size(),
                page.getTotalElements(), page.getTotalPages()), message);
    }

    public ProductDetail product(Integer id, Integer branchId) {
        Product product = products.findByIdAndStatusAndCategoryStatus(id, MenuStatus.Active, MenuStatus.Active)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND",
                        "Sản phẩm không tồn tại hoặc hiện không còn hiển thị."));
        if(branchId!=null) store.requireExists(branchId);
        var activeVariants = variants.findByProductIdInAndStatusOrderBySortOrderAscIdAsc(List.of(id), MenuStatus.Active);
        var variantAvailability = variantAvailability(branchId, activeVariants);
        var variantResponses = activeVariants.stream().map(v -> {
            var row = variantAvailability.get(v.getId());
            boolean available = isAvailable(v.getId(), variantAvailability);
            return new VariantResponse(v.getId(), v.getVariantName(), v.getPrice(), v.getSortOrder(), v.getStatus(),
                    available, available || row == null ? null : row.getUnavailableReason());
        }).toList();

        var optionGroups = groups.findByProductIdOrderBySortOrderAscIdAsc(id);
        var groupIds = optionGroups.stream().map(ProductOptionGroup::getId).toList();
        List<ProductOption> activeOptions = groupIds.isEmpty() ? List.of()
                : options.findByGroupIdInAndStatusOrderBySortOrderAscIdAsc(groupIds, MenuStatus.Active);
        var optionIds = activeOptions.stream().map(ProductOption::getId).toList();
        Map<Integer, BranchOptionAvailability> optionAvailability = branchId == null || optionIds.isEmpty() ? Map.of()
                : branchOptions.findByBranchIdAndOptionIdIn(branchId, optionIds).stream()
                    .collect(Collectors.toMap(BranchOptionAvailability::getOptionId, Function.identity()));
        var optionsByGroup = activeOptions.stream().collect(Collectors.groupingBy(ProductOption::getGroupId));
        var groupResponses = optionGroups.stream().map(g -> new OptionGroupResponse(g.getId(), g.getName(),
                g.getSelectionType(), g.isRequired(), g.getMinSelect(), g.getMaxSelect(), g.getSortOrder(),
                optionsByGroup.getOrDefault(g.getId(), List.of()).stream().map(o -> {
                    var row = optionAvailability.get(o.getId());
                    boolean available = row == null || row.isAvailable();
                    return new OptionResponse(o.getId(), o.getOptionName(), o.getExtraPrice(), o.isDefaultOption(),
                            o.getSortOrder(), o.getStatus(), available,
                            available || row == null ? null : row.getUnavailableReason());
                }).toList())).toList();
        return new ProductDetail(productResponse(product, variantResponses.stream().anyMatch(VariantResponse::available)),
                variantResponses, groupResponses);
    }

    private Map<Integer, BranchProductAvailability> variantAvailability(Integer branchId, List<ProductVariant> items) {
        if (branchId == null || items.isEmpty()) return Map.of();
        return branchVariants.findByBranchIdAndVariantIdIn(branchId, items.stream().map(ProductVariant::getId).toList())
                .stream().collect(Collectors.toMap(BranchProductAvailability::getVariantId, Function.identity()));
    }

    private boolean isAvailable(Integer variantId, Map<Integer, BranchProductAvailability> rows) {
        var row = rows.get(variantId);
        return row == null || row.isAvailable();
    }

    private ProductResponse productResponse(Product p, boolean available) {
        return new ProductResponse(p.getId(), p.getCategory().getId(), p.getName(), p.getImage(), p.getDescription(),
                p.getTemperature(), p.getCaffeineLevel(), p.getFlavorTags() == null ? List.of() : p.getFlavorTags(),
                p.getSortOrder(), p.getStatus(), p.getPrice(), p.getMaxPrice(), available);
    }
}

