package com.smart_cafe_ai.catalog_service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.catalog_service.model.*;
import java.math.BigDecimal;
import java.util.List;

public final class CatalogResponse {
    private CatalogResponse() {}

    public record CategoryResponse(Integer id, String name, String image,
            @JsonProperty("sort_order") int sortOrder, MenuStatus status,
            @JsonProperty("product_count") long productCount) {}

    public record CategoryStatusResponse(Integer id, MenuStatus status) {}

    public record CategoryDeletedResponse(Integer id) {}

    public record CategoryAdminResponse(Integer id, String name, String image,
            @JsonProperty("sort_order") int sortOrder, MenuStatus status,
            @JsonProperty("total_product_count") long totalProductCount,
            @JsonProperty("active_product_count") long activeProductCount) {
        // Preserve the existing admin-list field for clients that already consume it.
        @JsonProperty("product_count")
        public long productCount() { return activeProductCount; }
    }

    public record ProductResponse(Integer id, @JsonProperty("category_id") Integer categoryId,
            String name, String image, String description, Temperature temperature,
            @JsonProperty("caffeine_level") CaffeineLevel caffeineLevel,
            @JsonProperty("flavor_tags") List<String> flavorTags,
            @JsonProperty("sort_order") int sortOrder, MenuStatus status,
            BigDecimal price, @JsonProperty("max_price") BigDecimal maxPrice,
            @JsonProperty("is_available") boolean available) {}

    // Unwrapped product fields keep detail compatible with the product list representation.
    public record ProductDetail(@com.fasterxml.jackson.annotation.JsonUnwrapped ProductResponse product,
            List<VariantResponse> variants,
            @JsonProperty("option_groups") List<OptionGroupResponse> optionGroups) {}

    public record VariantResponse(Integer id, @JsonProperty("variant_name") String variantName,
            BigDecimal price, @JsonProperty("sort_order") int sortOrder, MenuStatus status,
            @JsonProperty("is_available") boolean available,
            @JsonProperty("unavailable_reason") String unavailableReason) {}

    public record OptionGroupResponse(Integer id, String name,
            @JsonProperty("selection_type") SelectionType selectionType,
            @JsonProperty("is_required") boolean required,
            @JsonProperty("min_select") int minSelect, @JsonProperty("max_select") int maxSelect,
            @JsonProperty("sort_order") int sortOrder, List<OptionResponse> options) {}

    public record OptionResponse(Integer id, @JsonProperty("option_name") String optionName,
            @JsonProperty("extra_price") BigDecimal extraPrice,
            @JsonProperty("is_default") boolean defaultOption,
            @JsonProperty("sort_order") int sortOrder, MenuStatus status,
            @JsonProperty("is_available") boolean available,
            @JsonProperty("unavailable_reason") String unavailableReason) {}
}

