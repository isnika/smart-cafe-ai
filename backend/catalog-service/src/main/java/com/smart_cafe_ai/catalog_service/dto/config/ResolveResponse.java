package com.smart_cafe_ai.catalog_service.dto.config;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.catalog_service.model.MenuStatus;
import java.math.BigDecimal;
import java.util.List;
public record ResolveResponse(List<Item> items) {
    public record Item(@JsonProperty("variant_id") Integer variantId,@JsonProperty("product_id") Integer productId,
                       @JsonProperty("product_name") String productName,@JsonProperty("variant_name") String variantName,
                       BigDecimal price,MenuStatus status,@JsonProperty("is_available") boolean available,List<Option> options) {}
    public record Option(@JsonProperty("option_id") Integer optionId,@JsonProperty("option_name") String optionName,
                         @JsonProperty("extra_price") BigDecimal extraPrice,MenuStatus status,
                         @JsonProperty("is_available") boolean available,int quantity) {}
}
