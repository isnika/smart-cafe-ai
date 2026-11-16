package com.smart_cafe_ai.catalog_service.dto.product;

import com.fasterxml.jackson.annotation.*;
import lombok.Getter;
import java.util.List;

@Getter
public class ProductCreateRequest extends ProductRequest {
    @JsonSetter(nulls = Nulls.FAIL, contentNulls = Nulls.FAIL)
    private List<VariantCreateRequest> variants = List.of();
    @JsonProperty("option_groups")
    @JsonSetter(nulls = Nulls.FAIL, contentNulls = Nulls.FAIL)
    private List<OptionGroupCreateRequest> optionGroups = List.of();
}
