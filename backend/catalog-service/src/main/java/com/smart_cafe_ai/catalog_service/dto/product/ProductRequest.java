package com.smart_cafe_ai.catalog_service.dto.product;

import com.fasterxml.jackson.annotation.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.smart_cafe_ai.catalog_service.dto.category.*;
import com.smart_cafe_ai.catalog_service.model.*;
import lombok.Getter;
import java.util.List;

@Getter
public class ProductRequest {
    @JsonProperty("category_id")
    @JsonDeserialize(using = StrictIntegerDeserializer.class)
    private Integer categoryId;
    @JsonDeserialize(using = StrictStringDeserializer.class)
    private String name;
    @JsonDeserialize(using = StrictStringDeserializer.class)
    private String image;
    @JsonDeserialize(using = StrictStringDeserializer.class)
    private String description;
    @JsonDeserialize(using = ProductValueDeserializers.TemperatureValue.class)
    private Temperature temperature;
    @JsonProperty("caffeine_level") @JsonSetter(nulls = Nulls.FAIL)
    @JsonDeserialize(using = ProductValueDeserializers.CaffeineValue.class)
    private CaffeineLevel caffeineLevel = CaffeineLevel.None;
    @JsonProperty("flavor_tags")
    @JsonDeserialize(contentUsing = StrictStringDeserializer.class)
    private List<String> flavorTags = List.of();
    @JsonProperty("sort_order") @JsonSetter(nulls = Nulls.FAIL)
    @JsonDeserialize(using = StrictIntegerDeserializer.class)
    private Integer sortOrder = 0;
    @JsonSetter(nulls = Nulls.FAIL)
    @JsonDeserialize(using = StrictMenuStatusDeserializer.class)
    private MenuStatus status = MenuStatus.Active;

    @JsonAnySetter
    public void rejectUnknown(String field, JsonNode value) {
        throw new IllegalArgumentException("Trường không được hỗ trợ trong sản phẩm: " + field);
    }
}
