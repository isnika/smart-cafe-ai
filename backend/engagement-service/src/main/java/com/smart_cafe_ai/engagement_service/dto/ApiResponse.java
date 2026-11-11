package com.smart_cafe_ai.engagement_service.dto;
import com.fasterxml.jackson.annotation.*;
import org.slf4j.MDC;
import org.springframework.data.domain.Page;
import java.util.*;
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiResponse(boolean success, Object data, Object meta, Object error, @JsonProperty("trace_id") String traceId) {
    public static ApiResponse ok(Object data) { return new ApiResponse(true,data,null,null,MDC.get("trace_id")); }
    public static ApiResponse page(Page<?> page) { return new ApiResponse(true,page.getContent(),Map.of("page",page.getNumber()+1,"size",page.getSize(),"total",page.getTotalElements()),null,MDC.get("trace_id")); }
    public static ApiResponse error(String code,String message,Object details) { return new ApiResponse(false,null,null,Map.of("code",code,"message",message,"details",details),MDC.get("trace_id")); }
}
