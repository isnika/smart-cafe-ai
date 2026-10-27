package com.smart_cafe_ai.catalog_service.dto.product;

import com.fasterxml.jackson.annotation.*;
import com.smart_cafe_ai.catalog_service.model.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record ProductAdminResponse(Integer id, @JsonProperty("category_id") Integer categoryId,
        @JsonProperty("category_name") String categoryName, @JsonProperty("category_status") MenuStatus categoryStatus,
        String name, String image, String description, Temperature temperature,
        @JsonProperty("caffeine_level") CaffeineLevel caffeineLevel, @JsonProperty("flavor_tags") List<String> flavorTags,
        @JsonProperty("sort_order") int sortOrder, MenuStatus status, BigDecimal price,
        @JsonProperty("max_price") BigDecimal maxPrice, @JsonProperty("is_available") boolean available,
        @JsonProperty("variant_count") long variantCount, @JsonProperty("active_variant_count") long activeVariantCount,
        @JsonProperty("option_group_count") long optionGroupCount,
        @JsonProperty("created_at") LocalDateTime createdAt, @JsonProperty("updated_at") LocalDateTime updatedAt) {

    public record Detail(@JsonUnwrapped ProductAdminResponse product, List<Variant> variants,
                         @JsonProperty("option_groups") List<Group> optionGroups) {}
    public record Variant(Integer id, @JsonProperty("variant_name") String variantName, BigDecimal price,
                          @JsonProperty("sort_order") int sortOrder, MenuStatus status) {}
    public record Group(Integer id, String name, @JsonProperty("selection_type") SelectionType selectionType,
                        @JsonProperty("is_required") boolean required, @JsonProperty("min_select") int minSelect,
                        @JsonProperty("max_select") int maxSelect, @JsonProperty("sort_order") int sortOrder,
                        List<Option> options) {}
    public record Option(Integer id, @JsonProperty("option_name") String optionName,
                         @JsonProperty("extra_price") BigDecimal extraPrice, @JsonProperty("is_default") boolean defaultOption,
                         @JsonProperty("sort_order") int sortOrder, MenuStatus status) {}
    public record Status(Integer id, MenuStatus status, @JsonProperty("updated_at") LocalDateTime updatedAt) {}
    public record Deleted(Integer id) {}
}
