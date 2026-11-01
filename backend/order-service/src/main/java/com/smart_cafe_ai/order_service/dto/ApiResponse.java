package com.smart_cafe_ai.order_service.dto;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.*;
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiResponse(boolean success,Object data,Object meta,Object error,String traceId) {
    public static ApiResponse ok(Object data){return new ApiResponse(true,data,null,null,org.slf4j.MDC.get("trace_id"));}
    public static ApiResponse page(Object data,int page,int size,long total){return new ApiResponse(true,data,
            Map.of("page",page,"size",size,"total",total,"total_pages",(total+size-1)/size),null,org.slf4j.MDC.get("trace_id"));}
    public static ApiResponse error(String code,String message){return new ApiResponse(false,null,null,
            Map.of("code",code,"message",message,"details",List.of()),org.slf4j.MDC.get("trace_id"));}
}
