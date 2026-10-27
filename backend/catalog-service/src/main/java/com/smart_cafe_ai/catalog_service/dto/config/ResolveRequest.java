package com.smart_cafe_ai.catalog_service.dto.config;
import com.fasterxml.jackson.annotation.*;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.smart_cafe_ai.catalog_service.dto.category.StrictIntegerDeserializer;
import lombok.Getter;
import java.util.List;
@Getter
public class ResolveRequest extends ConfigRequests.StrictBody {
    @JsonProperty("branch_id") @JsonDeserialize(using=StrictIntegerDeserializer.class) private Integer branchId;
    @JsonSetter(nulls=Nulls.FAIL,contentNulls=Nulls.FAIL) private List<Item> items;
    @Getter public static class Item extends ConfigRequests.StrictBody {
        @JsonProperty("variant_id") @JsonDeserialize(using=StrictIntegerDeserializer.class) private Integer variantId;
        @JsonSetter(nulls=Nulls.FAIL,contentNulls=Nulls.FAIL) private List<Option> options=List.of();
    }
    @Getter public static class Option extends ConfigRequests.StrictBody {
        @JsonProperty("option_id") @JsonDeserialize(using=StrictIntegerDeserializer.class) private Integer optionId;
        @JsonSetter(nulls=Nulls.FAIL) @JsonDeserialize(using=StrictIntegerDeserializer.class) private Integer quantity=1;
    }
}
