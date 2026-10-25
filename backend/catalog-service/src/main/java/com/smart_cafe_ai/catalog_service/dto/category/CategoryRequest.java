package com.smart_cafe_ai.catalog_service.dto.category;

import com.fasterxml.jackson.annotation.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.smart_cafe_ai.catalog_service.model.MenuStatus;
import lombok.Getter;

@Getter
public class CategoryRequest {
    @JsonDeserialize(using = StrictStringDeserializer.class)
    private String name;

    @JsonDeserialize(using = StrictStringDeserializer.class)
    private String image;

    @JsonProperty("sort_order")
    @JsonSetter(nulls = Nulls.FAIL)
    @JsonDeserialize(using = StrictIntegerDeserializer.class)
    private Integer sortOrder = 0;

    @JsonSetter(nulls = Nulls.FAIL)
    @JsonDeserialize(using = StrictMenuStatusDeserializer.class)
    private MenuStatus status = MenuStatus.Active;

    @JsonAnySetter
    public void rejectUnknown(String field, JsonNode value) {
        throw new IllegalArgumentException("Trường không được hỗ trợ trong danh mục: " + field);
    }
}

