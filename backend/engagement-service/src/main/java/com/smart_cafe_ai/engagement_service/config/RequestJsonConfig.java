package com.smart_cafe_ai.engagement_service.config;

import com.fasterxml.jackson.databind.*;
import com.smart_cafe_ai.engagement_service.dto.Requests;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import java.lang.reflect.Type;
import java.util.List;

/** Strict API inputs, while retaining the existing OTP JSON and response serialization. */
@Configuration
public class RequestJsonConfig implements WebMvcConfigurer {
    private final ObjectMapper mapper;
    public RequestJsonConfig(ObjectMapper mapper) { this.mapper=mapper; }
    @Override public void extendMessageConverters(List<HttpMessageConverter<?>> converters) {
        ObjectMapper strict=mapper.copy().disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
                .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
        converters.add(0,new MappingJackson2HttpMessageConverter(strict) {
            @Override public boolean canRead(Class<?> type,MediaType media) { return type.getEnclosingClass()==Requests.class&&super.canRead(type,media); }
            @Override public boolean canRead(Type type,Class<?> context,MediaType media) { return type instanceof Class<?> cls&&cls.getEnclosingClass()==Requests.class&&super.canRead(type,context,media); }
            @Override public boolean canWrite(Class<?> type,MediaType media) { return false; }
            @Override public boolean canWrite(Type type,Class<?> cls,MediaType media) { return false; }
        });
    }
}
