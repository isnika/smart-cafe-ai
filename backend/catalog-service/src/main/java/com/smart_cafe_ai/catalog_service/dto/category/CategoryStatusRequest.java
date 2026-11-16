package com.smart_cafe_ai.catalog_service.dto.category;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.smart_cafe_ai.catalog_service.model.MenuStatus;
import jakarta.validation.constraints.NotNull;

public record CategoryStatusRequest(
        @NotNull(message = "Vui lòng chọn trạng thái danh mục.")
        @JsonDeserialize(using = StrictMenuStatusDeserializer.class) MenuStatus status) {
    @JsonAnySetter
    public void rejectUnknown(String field, JsonNode value) {
        throw new IllegalArgumentException("PATCH status chỉ nhận trường status");
    }
}

