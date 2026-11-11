package com.smart_cafe_ai.api_gateway.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.server.*;
import org.springframework.web.util.UriUtils;
import reactor.core.publisher.Mono;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Component @Order(Ordered.HIGHEST_PRECEDENCE)
public class CatalogGatewayFilter implements WebFilter {
    private final SecretKey key;
    private final ObjectMapper json;
    public CatalogGatewayFilter(@Value("${jwt.secret}") String secret,ObjectMapper json) {
        byte[] bytes=Decoders.BASE64.decode(secret);
        key=Keys.hmacShaKeyFor(bytes.length<32?secret.getBytes(StandardCharsets.UTF_8):bytes);this.json=json;
    }
    @Override public Mono<Void> filter(ServerWebExchange exchange,WebFilterChain chain) {
        String trace=exchange.getRequest().getHeaders().getFirst("X-Trace-Id");
        try{trace=UUID.fromString(trace).toString();}catch(Exception ignored){trace=UUID.randomUUID().toString();}
        exchange=exchange.mutate().request(exchange.getRequest().mutate().header("X-Trace-Id",trace).build()).build();
        exchange.getResponse().getHeaders().set("X-Trace-Id",trace);
        String path=exchange.getRequest().getURI().getRawPath();
        try{for(int i=0;i<2;i++) path=UriUtils.decode(path,StandardCharsets.UTF_8);}catch(IllegalArgumentException ex){return error(exchange,400,"VALIDATION_ERROR","Đường dẫn không hợp lệ.",trace);}
        List<String> segments=Arrays.stream(path.replace('\\','/').split("/+"))
                .filter(s->!s.isEmpty()).map(s->s.split(";",2)[0]).toList();
        // Includes discovery-locator aliases and encoded path segments, before any route forwarding.
        if(segments.stream().anyMatch(s->s.equalsIgnoreCase("internal")))
            return error(exchange,404,"NOT_FOUND","API nội bộ không được truy cập qua Gateway.",trace);
        int catalog=segments.indexOf("catalog");
        if(catalog<0 || exchange.getRequest().getMethod()==HttpMethod.OPTIONS) return chain.filter(exchange);
        String suffix=String.join("/",segments.subList(catalog+1,segments.size()));
        boolean read=exchange.getRequest().getMethod()==HttpMethod.GET || exchange.getRequest().getMethod()==HttpMethod.HEAD;
        boolean publicRead=read && (suffix.equals("categories") || suffix.equals("products") || suffix.matches("products/[^/]+"));
        if(suffix.equals("categories") && "Inactive".equals(exchange.getRequest().getQueryParams().getFirst("status"))) publicRead=false;
        if(publicRead) return chain.filter(exchange);
        String authorization=exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        if(authorization==null || !authorization.startsWith("Bearer ")) return error(exchange,401,"UNAUTHORIZED","Vui lòng đăng nhập để quản lý thực đơn.",trace);
        try {
            Claims claims=Jwts.parser().verifyWith(key).build().parseSignedClaims(authorization.substring(7)).getPayload();
            if(claims.getExpiration()==null || claims.getSubject()==null || claims.getSubject().isBlank() || claims.getSubject().length()>36)
                return error(exchange,401,"UNAUTHORIZED","Phiên đăng nhập không hợp lệ.",trace);
            if(!"Manager".equals(claims.get("role")) && !"Admin".equals(claims.get("role"))) return error(exchange,403,"FORBIDDEN","Bạn không có quyền quản lý thực đơn.",trace);
        } catch(ExpiredJwtException ex) {return error(exchange,401,"TOKEN_EXPIRED","Phiên đăng nhập đã hết hạn.",trace);}
        catch(JwtException|IllegalArgumentException ex) {return error(exchange,401,"UNAUTHORIZED","Phiên đăng nhập không hợp lệ.",trace);}
        return chain.filter(exchange);
    }
    private Mono<Void> error(ServerWebExchange exchange,int status,String code,String message,String trace) {
        exchange.getResponse().setStatusCode(HttpStatusCode.valueOf(status));
        exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
        try {
            byte[] body=json.writeValueAsBytes(Map.of("success",false,"error",Map.of("code",code,"message",message,"details",List.of()),"trace_id",trace));
            return exchange.getResponse().writeWith(Mono.just(exchange.getResponse().bufferFactory().wrap(body)));
        }catch(com.fasterxml.jackson.core.JsonProcessingException ex){return Mono.error(ex);}
    }
}
