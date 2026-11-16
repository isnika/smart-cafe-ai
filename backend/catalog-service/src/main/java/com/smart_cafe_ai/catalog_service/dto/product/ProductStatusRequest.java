package com.smart_cafe_ai.catalog_service.dto.product;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.smart_cafe_ai.catalog_service.dto.category.StrictMenuStatusDeserializer;
import com.smart_cafe_ai.catalog_service.model.MenuStatus;
import jakarta.validation.constraints.NotNull;

public record ProductStatusRequest(
        @NotNull(message = "Vui lòng chọn trạng thái sản phẩm.")
        @JsonDeserialize(using = StrictMenuStatusDeserializer.class) MenuStatus status) {
    @JsonAnySetter
    public void rejectUnknown(String field, JsonNode value) {
        throw new IllegalArgumentException("Vui lòng chỉ gửi trạng thái sản phẩm.");
    }
}
