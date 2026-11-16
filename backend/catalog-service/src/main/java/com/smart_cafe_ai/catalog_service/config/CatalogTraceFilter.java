package com.smart_cafe_ai.catalog_service.config;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.slf4j.MDC;
import java.io.IOException;
import java.util.UUID;
@Component
public class CatalogTraceFilter extends OncePerRequestFilter {
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
        String trace=request.getHeader("X-Trace-Id");
        try {trace=UUID.fromString(trace).toString();}catch(Exception ignored){trace=UUID.randomUUID().toString();}
        response.setHeader("X-Trace-Id",trace);
        try(MDC.MDCCloseable scope=MDC.putCloseable("trace_id",trace)){chain.doFilter(request,response);}
    }
}
