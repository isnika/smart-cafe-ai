package com.smart_cafe_ai.catalog_service.dto.config;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.catalog_service.model.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
public final class ConfigResponse {
    private ConfigResponse() {}
    public record Variant(Integer id,@JsonProperty("product_id") Integer productId,
                          @JsonProperty("variant_name") String variantName,BigDecimal price,
                          @JsonProperty("sort_order") int sortOrder,MenuStatus status) {}
    public record Group(Integer id,@JsonProperty("product_id") Integer productId,String name,
                        @JsonProperty("selection_type") SelectionType selectionType,@JsonProperty("is_required") boolean required,
                        @JsonProperty("min_select") int minSelect,@JsonProperty("max_select") int maxSelect,
                        @JsonProperty("sort_order") int sortOrder) {}
    public record Option(Integer id,@JsonProperty("group_id") Integer groupId,@JsonProperty("option_name") String optionName,
                         @JsonProperty("extra_price") BigDecimal extraPrice,@JsonProperty("is_default") boolean defaultOption,
                         @JsonProperty("sort_order") int sortOrder,MenuStatus status) {}
    public record Status(Integer id,MenuStatus status) {}
    public record Price(Integer id,BigDecimal price) {}
    public record History(Long id,@JsonProperty("variant_id") Integer variantId,@JsonProperty("old_price") BigDecimal oldPrice,
                          @JsonProperty("new_price") BigDecimal newPrice,@JsonProperty("changed_by") String changedBy,
                          @JsonProperty("changed_at") LocalDateTime changedAt) {}
    public record VariantAvailability(@JsonProperty("branch_id") Integer branchId,@JsonProperty("variant_id") Integer variantId,
                                     @JsonProperty("is_available") boolean available,@JsonProperty("unavailable_reason") String reason,
                                     @JsonProperty("updated_at") LocalDateTime updatedAt) {}
    public record OptionAvailability(@JsonProperty("branch_id") Integer branchId,@JsonProperty("option_id") Integer optionId,
                                    @JsonProperty("is_available") boolean available,@JsonProperty("unavailable_reason") String reason,
                                    @JsonProperty("updated_at") LocalDateTime updatedAt) {}
}
