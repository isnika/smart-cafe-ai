package com.smart_cafe_ai.order_service.config;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.slf4j.MDC;
import java.io.IOException;
import java.util.UUID;
@Component
public class TraceFilter extends OncePerRequestFilter {
    @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain) throws ServletException,IOException {
        String trace;try{trace=UUID.fromString(req.getHeader("X-Trace-Id")).toString();}catch(Exception ex){trace=UUID.randomUUID().toString();}
        MDC.put("trace_id",trace);res.setHeader("X-Trace-Id",trace);
        try{chain.doFilter(req,res);}finally{MDC.remove("trace_id");}
    }
}
