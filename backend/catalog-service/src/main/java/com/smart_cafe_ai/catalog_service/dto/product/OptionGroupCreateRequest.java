package com.smart_cafe_ai.catalog_service.dto.product;

import com.fasterxml.jackson.annotation.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.smart_cafe_ai.catalog_service.dto.category.*;
import com.smart_cafe_ai.catalog_service.model.SelectionType;
import lombok.Getter;
import java.util.List;

@Getter
public class OptionGroupCreateRequest {
    @JsonDeserialize(using = StrictStringDeserializer.class)
    private String name;
    @JsonProperty("selection_type") @JsonDeserialize(using = ProductValueDeserializers.SelectionValue.class)
    private SelectionType selectionType;
    @JsonProperty("is_required") @JsonSetter(nulls = Nulls.FAIL)
    @JsonDeserialize(using = ProductValueDeserializers.BooleanValue.class)
    private Boolean required = false;
    @JsonProperty("min_select") @JsonSetter(nulls = Nulls.FAIL)
    @JsonDeserialize(using = StrictIntegerDeserializer.class)
    private Integer minSelect = 0;
    @JsonProperty("max_select") @JsonSetter(nulls = Nulls.FAIL)
    @JsonDeserialize(using = StrictIntegerDeserializer.class)
    private Integer maxSelect = 1;
    @JsonProperty("sort_order") @JsonSetter(nulls = Nulls.FAIL)
    @JsonDeserialize(using = StrictIntegerDeserializer.class)
    private Integer sortOrder = 0;
    @JsonSetter(nulls = Nulls.FAIL, contentNulls = Nulls.FAIL)
    private List<OptionCreateRequest> options = List.of();

    @JsonAnySetter
    public void rejectUnknown(String field, JsonNode value) {
        throw new IllegalArgumentException("Trường nhóm tùy chọn không được hỗ trợ: " + field);
    }
}
