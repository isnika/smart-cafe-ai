package com.smart_cafe_ai.catalog_service.dto.product;

import com.fasterxml.jackson.core.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.exc.MismatchedInputException;
import com.smart_cafe_ai.catalog_service.model.*;
import java.io.IOException;
import java.math.BigDecimal;

public final class ProductValueDeserializers {
    private ProductValueDeserializers() {}

    private abstract static class EnumValue<T extends Enum<T>> extends JsonDeserializer<T> {
        private final Class<T> type;
        EnumValue(Class<T> type) { this.type = type; }
        @Override public T deserialize(JsonParser p, DeserializationContext context) throws IOException {
            if (p.hasToken(JsonToken.VALUE_STRING)) {
                for (T value : type.getEnumConstants()) if (value.name().equals(p.getText())) return value;
            }
            throw MismatchedInputException.from(p, type, "Giá trị không nằm trong danh sách cho phép");
        }
    }
    public static class TemperatureValue extends EnumValue<Temperature> {
        public TemperatureValue() { super(Temperature.class); }
    }
    public static class CaffeineValue extends EnumValue<CaffeineLevel> {
        public CaffeineValue() { super(CaffeineLevel.class); }
    }
    public static class SelectionValue extends EnumValue<SelectionType> {
        public SelectionValue() { super(SelectionType.class); }
    }
    public static class MoneyValue extends JsonDeserializer<BigDecimal> {
        @Override public BigDecimal deserialize(JsonParser p, DeserializationContext context) throws IOException {
            if (p.currentToken().isNumeric()) return p.getDecimalValue();
            throw MismatchedInputException.from(p, BigDecimal.class, "Giá phải là số JSON");
        }
    }
    public static class BooleanValue extends JsonDeserializer<Boolean> {
        @Override public Boolean deserialize(JsonParser p, DeserializationContext context) throws IOException {
            if (p.hasToken(JsonToken.VALUE_TRUE)) return true;
            if (p.hasToken(JsonToken.VALUE_FALSE)) return false;
            throw MismatchedInputException.from(p, Boolean.class, "Giá trị phải là true hoặc false");
        }
    }
}
