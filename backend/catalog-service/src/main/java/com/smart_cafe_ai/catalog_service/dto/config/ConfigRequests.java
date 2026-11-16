package com.smart_cafe_ai.catalog_service.dto.config;

import com.fasterxml.jackson.annotation.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.smart_cafe_ai.catalog_service.dto.category.*;
import com.smart_cafe_ai.catalog_service.dto.product.ProductValueDeserializers;
import com.smart_cafe_ai.catalog_service.model.*;
import lombok.Getter;
import java.math.BigDecimal;

public final class ConfigRequests {
    private ConfigRequests() {}
    public abstract static class StrictBody {
        @JsonAnySetter public void unknown(String field, JsonNode ignored) {
            throw new IllegalArgumentException("Trường không được hỗ trợ: "+field);
        }
    }
    @Getter public static class VariantUpdate extends StrictBody {
        @JsonProperty("variant_name") @JsonDeserialize(using=StrictStringDeserializer.class)
        private String variantName;
        @JsonProperty("sort_order") @JsonSetter(nulls=Nulls.FAIL) @JsonDeserialize(using=StrictIntegerDeserializer.class)
        private Integer sortOrder=0;
        @JsonSetter(nulls=Nulls.FAIL) @JsonDeserialize(using=StrictMenuStatusDeserializer.class)
        private MenuStatus status=MenuStatus.Active;
    }
    @Getter public static class Group extends StrictBody {
        @JsonDeserialize(using=StrictStringDeserializer.class) private String name;
        @JsonProperty("selection_type") @JsonDeserialize(using=ProductValueDeserializers.SelectionValue.class)
        private SelectionType selectionType;
        @JsonProperty("is_required") @JsonSetter(nulls=Nulls.FAIL) @JsonDeserialize(using=ProductValueDeserializers.BooleanValue.class)
        private Boolean required=false;
        @JsonProperty("min_select") @JsonSetter(nulls=Nulls.FAIL) @JsonDeserialize(using=StrictIntegerDeserializer.class)
        private Integer minSelect=0;
        @JsonProperty("max_select") @JsonSetter(nulls=Nulls.FAIL) @JsonDeserialize(using=StrictIntegerDeserializer.class)
        private Integer maxSelect=1;
        @JsonProperty("sort_order") @JsonSetter(nulls=Nulls.FAIL) @JsonDeserialize(using=StrictIntegerDeserializer.class)
        private Integer sortOrder=0;
    }
    public record Price(@JsonDeserialize(using=ProductValueDeserializers.MoneyValue.class) BigDecimal price) {
        @JsonAnySetter public void unknown(String field,JsonNode ignored) { throw new IllegalArgumentException("Chỉ gửi giá biến thể."); }
    }
    public record Status(@JsonDeserialize(using=StrictMenuStatusDeserializer.class) MenuStatus status) {
        @JsonAnySetter public void unknown(String field,JsonNode ignored) { throw new IllegalArgumentException("Chỉ gửi trạng thái."); }
    }
    public record Availability(
            @JsonProperty("is_available") @JsonDeserialize(using=ProductValueDeserializers.BooleanValue.class) Boolean available,
            @JsonProperty("unavailable_reason") @JsonDeserialize(using=StrictStringDeserializer.class) String reason) {
        @JsonAnySetter public void unknown(String field,JsonNode ignored) { throw new IllegalArgumentException("Chỉ gửi thông tin khả dụng."); }
    }
}
