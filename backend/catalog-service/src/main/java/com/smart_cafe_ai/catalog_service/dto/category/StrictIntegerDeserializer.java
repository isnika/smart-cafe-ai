package com.smart_cafe_ai.catalog_service.dto.category;

import com.fasterxml.jackson.core.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.exc.MismatchedInputException;
import java.io.IOException;

public class StrictIntegerDeserializer extends JsonDeserializer<Integer> {
    @Override
    public Integer deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT)) {
            throw MismatchedInputException.from(parser, Integer.class, "sort_order phải là số nguyên");
        }
        return parser.getIntValue();
    }
}

