package com.smart_cafe_ai.catalog_service;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.catalog_service.integration.HttpStoreBranchVerifier;
import com.smart_cafe_ai.catalog_service.exception.ApiException;
import org.junit.jupiter.api.*;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import static org.junit.jupiter.api.Assertions.*;
class StoreIntegrationBoundaryTest {
    @Test void missingBackend2ConfigurationNeverFabricatesABranch() {
        var client=new HttpStoreBranchVerifier("","","",new ObjectMapper());
        var ex=assertThrows(ApiException.class,()->client.requireExists(1));
        assertEquals(503,ex.getStatus().value());assertEquals("STORE_INTEGRATION_NOT_CONFIGURED",ex.getCode());
    }
    @Test void configuredHttpAdapterChecksRealResponseAndNeverFallsBackOnFailure() throws Exception {
        // HTTP double exists only inside this test. No production fallback or demo branch is installed.
        HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/internal/branches/",exchange->{
            assertEquals("agreed-test-key",exchange.getRequestHeaders().getFirst("X-Service-Key"));
            String id=exchange.getRequestURI().getPath().substring("/internal/branches/".length());
            int code=id.equals("1")||id.equals("3")?200:id.equals("2")?404:500;
            String body=id.equals("1")?"{\"success\":true,\"data\":{\"id\":1}}":"{\"success\":true,\"data\":{\"id\":999}}";
            byte[] bytes=body.getBytes(StandardCharsets.UTF_8);exchange.sendResponseHeaders(code,bytes.length);
            exchange.getResponseBody().write(bytes);exchange.close();
        });
        server.start();
        try {
            var client=new HttpStoreBranchVerifier("http://127.0.0.1:"+server.getAddress().getPort()+"/internal","X-Service-Key","agreed-test-key",new ObjectMapper());
            assertDoesNotThrow(()->client.requireExists(1));
            assertEquals(404,assertThrows(ApiException.class,()->client.requireExists(2)).getStatus().value());
            assertEquals(503,assertThrows(ApiException.class,()->client.requireExists(3)).getStatus().value());
            assertEquals(503,assertThrows(ApiException.class,()->client.requireExists(4)).getStatus().value());
        } finally{server.stop(0);}
    }
}
