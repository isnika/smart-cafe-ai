package com.smart_cafe_ai.catalog_service.dto.category;

import com.fasterxml.jackson.core.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.exc.MismatchedInputException;
import java.io.IOException;

public class StrictStringDeserializer extends JsonDeserializer<String> {
    @Override
    public String deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        if (!parser.hasToken(JsonToken.VALUE_STRING)) {
            throw MismatchedInputException.from(parser, String.class, "Giá trị phải là chuỗi văn bản");
        }
        return parser.getText();
    }
}

