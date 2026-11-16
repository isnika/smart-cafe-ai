package com.smart_cafe_ai.catalog_service.dto.category;

import com.fasterxml.jackson.core.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.exc.MismatchedInputException;
import com.smart_cafe_ai.catalog_service.model.MenuStatus;
import java.io.IOException;

public class StrictMenuStatusDeserializer extends JsonDeserializer<MenuStatus> {
    @Override
    public MenuStatus deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        if (parser.hasToken(JsonToken.VALUE_STRING)) {
            for (MenuStatus status : MenuStatus.values()) {
                if (status.name().equals(parser.getText())) return status;
            }
        }
        throw MismatchedInputException.from(parser, MenuStatus.class, "status phải là Active hoặc Inactive");
    }
}

