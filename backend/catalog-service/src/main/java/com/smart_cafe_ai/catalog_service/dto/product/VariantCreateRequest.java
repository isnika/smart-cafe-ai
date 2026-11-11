package com.smart_cafe_ai.catalog_service.dto.product;

import com.fasterxml.jackson.annotation.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.smart_cafe_ai.catalog_service.dto.category.*;
import com.smart_cafe_ai.catalog_service.model.MenuStatus;
import lombok.Getter;
import java.math.BigDecimal;

@Getter
public class VariantCreateRequest {
    @JsonProperty("variant_name") @JsonDeserialize(using = StrictStringDeserializer.class)
    private String variantName;
    @JsonDeserialize(using = ProductValueDeserializers.MoneyValue.class)
    private BigDecimal price;
    @JsonProperty("sort_order") @JsonSetter(nulls = Nulls.FAIL)
    @JsonDeserialize(using = StrictIntegerDeserializer.class)
    private Integer sortOrder = 0;
    @JsonSetter(nulls = Nulls.FAIL) @JsonDeserialize(using = StrictMenuStatusDeserializer.class)
    private MenuStatus status = MenuStatus.Active;

    @JsonAnySetter
    public void rejectUnknown(String field, JsonNode value) {
        throw new IllegalArgumentException("Trường biến thể không được hỗ trợ: " + field);
    }
}
