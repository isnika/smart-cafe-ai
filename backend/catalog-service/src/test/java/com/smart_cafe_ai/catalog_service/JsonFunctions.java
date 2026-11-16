package com.smart_cafe_ai.catalog_service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

// H2 has no MySQL JSON_CONTAINS. This alias covers scalar membership in the test DB.
// Production executes MySQL's JSON_CONTAINS against the native JSON column.
public final class JsonFunctions {
    private static final ObjectMapper JSON = new ObjectMapper();
    private JsonFunctions() {}

    public static Integer contains(String document, String candidate) throws Exception {
        if (document == null || candidate == null) return null;
        JsonNode array = JSON.readTree(document);
        if (array.isTextual()) array = JSON.readTree(array.asText());
        JsonNode target = JSON.readTree(candidate);
        for (JsonNode value : array) if (value.equals(target)) return 1;
        return 0;
    }
}

