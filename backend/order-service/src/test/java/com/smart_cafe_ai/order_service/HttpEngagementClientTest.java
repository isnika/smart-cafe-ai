package com.smart_cafe_ai.order_service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.order_service.exception.ApiException;
import com.smart_cafe_ai.order_service.integration.HttpEngagementClient;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.math.BigDecimal;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

/** Isolated HTTP contract tests only; runtime uses the configured Engagement service. */
class HttpEngagementClientTest {
    HttpServer server;
    HttpEngagementClient client;
    String response,path,body,key;
    int status;
    AtomicInteger requests;
    @BeforeEach void setup() throws Exception {
        requests=new AtomicInteger();status=201;
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange->{
            requests.incrementAndGet();path=exchange.getRequestURI().getPath();
            key=exchange.getRequestHeaders().getFirst("X-Service-Key");body=new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8);
            byte[] bytes=response.getBytes(StandardCharsets.UTF_8);exchange.sendResponseHeaders(status,bytes.length);
            exchange.getResponseBody().write(bytes);exchange.close();
        });server.start();
        client=new HttpEngagementClient("http://127.0.0.1:"+server.getAddress().getPort()+"/api/v1/internal","service-key",new ObjectMapper());
    }
    @AfterEach void stop(){server.stop(0);}
    @Test void applyAcceptsCreatedAndValidatesDiscountAndOrderIdentity() {
        response="{\"success\":true,\"data\":{\"voucher_id\":4,\"order_id\":8,\"discount_amount\":10000,\"status\":\"Applied\"}}";
        assertEquals(new BigDecimal("10000"),client.apply("SAVE","user",8L,1,"Pickup",new BigDecimal("50000")));
        assertEquals("/api/v1/internal/vouchers/apply",path);assertEquals("service-key",key);
        assertTrue(body.contains("\"order_amount\":50000"));
        response=response.replace("\"order_id\":8","\"order_id\":9");
        assertEquals("ENGAGEMENT_UNAVAILABLE",assertThrows(ApiException.class,()->client.apply("SAVE","user",8L,1,"Pickup",new BigDecimal("50000"))).code);
    }
    @Test void redeemSendsStableIdempotencyKeyAndChecksAcknowledgement() {
        response="{\"success\":true,\"data\":{\"transaction\":{\"order_id\":8,\"user_id\":\"user\",\"transaction_type\":\"Redeem\",\"stamps\":-10},\"loyalty_card\":{}}}";
        client.redeem("user",8L);String original=body;status=200;client.redeem("user",8L);
        assertEquals(original,body);assertTrue(body.contains("order:8:reward"));
        assertEquals("/api/v1/internal/loyalty/redeem",path);
    }
    @Test void outageRetriesTwiceButNeverReturnsFallbackDiscount() {
        status=503;response="{\"success\":false}";
        assertThrows(ApiException.class,()->client.apply("SAVE","user",8L,1,"Pickup",new BigDecimal("50000")));
        assertEquals(2,requests.get());
    }
    @Test void businessRejectionKeepsErrorAndDoesNotRetry() {
        status=422;response="{\"success\":false,\"error\":{\"code\":\"INSUFFICIENT_STAMPS\",\"message\":\"Need 10 stamps\"}}";
        assertEquals("INSUFFICIENT_STAMPS",assertThrows(ApiException.class,()->client.redeem("user",8L)).code);
        assertEquals(1,requests.get());
    }
    @Test void reverseCallsAuthenticatedIdempotentEndpoint() {
        status=200;response="{\"success\":true,\"data\":{\"order_id\":8,\"status\":\"Reversed\"}}";
        client.reverse("user",8L);assertEquals("/api/v1/internal/benefits/reverse",path);
        assertEquals("service-key",key);
    }
    @Test void missingConfigurationMakesNoHttpRequest() {
        var unconfigured=new HttpEngagementClient("http://127.0.0.1:"+server.getAddress().getPort(),"",new ObjectMapper());
        assertEquals("ENGAGEMENT_INTEGRATION_NOT_CONFIGURED",assertThrows(ApiException.class,()->unconfigured.redeem("user",8L)).code);
        assertEquals(0,requests.get());
    }
}
