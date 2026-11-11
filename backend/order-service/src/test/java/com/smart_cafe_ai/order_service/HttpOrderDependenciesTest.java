package com.smart_cafe_ai.order_service;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.smart_cafe_ai.order_service.dto.Requests.*;
import com.smart_cafe_ai.order_service.exception.ApiException;
import com.smart_cafe_ai.order_service.integration.HttpOrderDependencies;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.springframework.mock.env.MockEnvironment;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.assertj.core.api.Assertions.*;

class HttpOrderDependenciesTest {
    HttpServer server;
    MockEnvironment env;
    HttpOrderDependencies client;
    AtomicReference<String> path,body,credential;
    int status;
    String response;
    @BeforeEach void setup() throws Exception {
        status=200;response="{\"success\":true,\"data\":{\"id\":1,\"status\":\"Active\",\"accepts_online_orders\":true,\"delivery_fee\":10000,\"name\":\"extra field\"}}";
        path=new AtomicReference<>();body=new AtomicReference<>();credential=new AtomicReference<>();server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange->{path.set(exchange.getRequestURI().getRawPath());credential.set(exchange.getRequestHeaders().getFirst("X-Service-Key"));body.set(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));byte[] bytes=response.getBytes(StandardCharsets.UTF_8);exchange.sendResponseHeaders(status,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();});server.start();
        env=new MockEnvironment();for(String service:List.of("store","catalog","identity")){env.withProperty("app."+service+".internal-base-url","http://127.0.0.1:"+server.getAddress().getPort()+"/internal/"+service).withProperty("app."+service+".auth-value","secret");}
        var json=new ObjectMapper().registerModule(new JavaTimeModule()).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE).enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        client=new HttpOrderDependencies(env,json);
    }
    @AfterEach void stop(){server.stop(0);}
    @Test void storeLookupRequiresCredentialsAndCorrectIdentity(){assertThat(client.branch(1).deliveryFee()).isEqualByComparingTo("10000");assertThat(path.get()).isEqualTo("/internal/store/branches/1");assertThat(credential.get()).isEqualTo("secret");assertThatThrownBy(()->client.branch(2)).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code).isEqualTo("STORE_UNAVAILABLE"));}
    @Test void unconfiguredStoreFailsClosed(){env.withProperty("app.store.auth-value","");assertThatThrownBy(()->client.branch(1)).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code).isEqualTo("STORE_INTEGRATION_NOT_CONFIGURED"));}
    @Test void malformedOrErrorResponseNeverBecomesValidBranch(){for(String invalid:List.of("{}","{\"success\":false}","{\"success\":true,\"data\":{\"id\":1}}")){response=invalid;assertThatThrownBy(()->client.branch(1)).isInstanceOf(ApiException.class);}status=500;assertThatThrownBy(()->client.branch(1)).isInstanceOf(ApiException.class);}
    @Test void catalogResolveMatchesExistingCatalogShape(){
        response="{\"success\":true,\"data\":{\"items\":[{\"variant_id\":1,\"product_id\":10,\"product_name\":\"Coffee\",\"variant_name\":\"M\",\"price\":30000,\"status\":\"Active\",\"is_available\":true,\"options\":[{\"option_id\":5,\"option_name\":\"Topping\",\"extra_price\":5000,\"status\":\"Active\",\"is_available\":true,\"quantity\":2}]}]}}";
        var result=client.resolve(1,List.of(new Item(1,2,null,List.of(new Option(5,2)))));assertThat(result.get(0).options().get(0).quantity()).isEqualTo(2);assertThat(path.get()).endsWith("/resolve");assertThat(body.get()).contains("\"branch_id\":1").doesNotContain("\"quantity\":2,\"note\"");
        response=response.replace("\"variant_id\":1","\"variant_id\":2");assertThatThrownBy(()->client.resolve(1,List.of(new Item(1,2,null,List.of(new Option(5,2)))))).isInstanceOf(ApiException.class);
    }
    @Test void posCustomerLookupUsesIdentityBatchIdsAndRoleName(){response="{\"success\":true,\"data\":[{\"id\":\"customer\",\"status\":\"Active\",\"role_name\":\"Customer\"}]}";client.requireCustomer("customer");assertThat(body.get()).isEqualTo("{\"ids\":[\"customer\"]}");assertThat(path.get()).endsWith("/users/batch");}
}
