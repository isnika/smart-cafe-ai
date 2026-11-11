package com.smart_cafe_ai.identity_service.dto;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.exc.MismatchedInputException;
import java.io.IOException;

/** Prevent Jackson from silently accepting numeric or boolean contact/name fields. */
public class StrictStringDeserializer extends JsonDeserializer<String> {
    @Override
    public String deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        if (!parser.hasToken(JsonToken.VALUE_STRING)) {
            throw MismatchedInputException.from(parser, String.class, "Trường thông tin phải là chuỗi văn bản");
        }
        return parser.getText();
    }
}
