package com.smart_cafe_ai.engagement_service.config;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.UUID;
@Component
public class TraceFilter extends OncePerRequestFilter {
    @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain) throws ServletException,IOException {
        String trace=req.getHeader("X-Trace-Id");
        if(trace==null||!trace.matches("[a-zA-Z0-9_-]{1,64}")) trace=UUID.randomUUID().toString();
        res.setHeader("X-Trace-Id",trace);
        try(MDC.MDCCloseable ignored=MDC.putCloseable("trace_id",trace)) { chain.doFilter(req,res); }
    }
}
