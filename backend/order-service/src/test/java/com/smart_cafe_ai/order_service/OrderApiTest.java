package com.smart_cafe_ai.order_service;

import com.fasterxml.jackson.databind.*;
import com.smart_cafe_ai.order_service.integration.OrderDependencies;
import com.smart_cafe_ai.order_service.integration.EngagementClient;
import com.smart_cafe_ai.order_service.integration.OrderDependencies.*;
import com.smart_cafe_ai.order_service.model.Types.*;
import com.smart_cafe_ai.order_service.repository.*;
import com.smart_cafe_ai.order_service.service.*;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class OrderApiTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired OrderRepository orders;
    @Autowired OutboxRepository outbox;
    @Autowired PaymentEventService payments;
    @Autowired OrderExpiryService expiry;
    @SpyBean OrderEvents eventWriter;
    @MockBean OrderDependencies dependencies;
    @MockBean EngagementClient engagement;
    @Autowired EngagementCheckoutRepository checkouts;
    @Autowired EngagementCheckoutRecovery recovery;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
    final String customer=token("customer-1","Customer"),other=token("customer-2","Customer"),staff=token("staff-1","Staff"),manager=token("manager-1","Manager"),admin=token("admin-1","Admin");

    @BeforeEach void setup(){
        checkouts.deleteAll();
        doThrow(new com.smart_cafe_ai.order_service.exception.ApiException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                "ENGAGEMENT_INTEGRATION_NOT_CONFIGURED","Missing test configuration")).when(engagement).requireConfigured();
        for(String table:List.of("Order_Payment_Entries","Processed_Events","Outbox_Events","Order_Item_Options","Order_Status_History","Order_Items","Orders","Cart_Item_Options","Cart_Items","Carts"))jdbc.update("delete from "+table);
        jdbc.execute("alter table Carts add if not exists active_online_user_id varchar(36) generated always as (case when cart_source='Online' and status='Active' then user_id else null end)");
        jdbc.execute("create unique index if not exists uq_test_active_online on Carts(active_online_user_id)");
        when(dependencies.branch(anyInt())).thenAnswer(i->new Branch(i.getArgument(0),"Active",true,new BigDecimal("15000"),new BigDecimal("10"),new BigDecimal("10.8"),new BigDecimal("106.7"),"Asia/Ho_Chi_Minh",null,null));
        when(dependencies.sessionByCode(anyString())).thenAnswer(i->new Session(i.getArgument(0).equals("other-session")?12L:11L,1,"Active",LocalDateTime.now(ZoneOffset.UTC).plusHours(1)));
        when(dependencies.sessionById(anyLong())).thenAnswer(i->new Session(i.getArgument(0),1,"Active",null));
        when(dependencies.staff(anyString())).thenAnswer(i->new Staff(i.getArgument(0),1,"Active"));
        when(dependencies.resolve(anyInt(),anyList())).thenAnswer(i->{
            List<com.smart_cafe_ai.order_service.dto.Requests.Item> items=i.getArgument(1);
            return items.stream().map(item->new ResolvedItem(item.variantId(),100,"Ca phe","Size M",new BigDecimal("30000"),item.options().stream().map(o->new ResolvedOption(o.optionId(),"Topping",new BigDecimal("5000"),o.quantity())).toList())).toList();
        });
    }
    static String token(String user,String role){return "Bearer "+Jwts.builder().subject(user).claim("role",role).issuedAt(new Date()).expiration(Date.from(Instant.now().plusSeconds(3600))).signWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode("404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970"))).compact();}
    JsonNode data(MvcResult result) throws Exception{return json.readTree(result.getResponse().getContentAsString()).path("data");}
    ResultActions call(MockHttpServletRequestBuilder r,String auth,String body) throws Exception {if(auth!=null)r.header("Authorization",auth);if(body!=null)r.contentType(MediaType.APPLICATION_JSON).content(body);return mvc.perform(r);}
    long cart() throws Exception {long id=data(call(post("/api/v1/carts"),customer,"{\"cart_source\":\"Online\",\"branch_id\":1,\"fulfillment_type\":\"Pickup\"}").andExpect(status().isCreated()).andReturn()).path("id").asLong();
        call(post("/api/v1/carts/current/items?source=Online"),customer,"{\"variant_id\":1,\"quantity\":2,\"options\":[{\"option_id\":5,\"quantity\":2}]}").andExpect(status().isCreated());return id;}
    String orderBody(long cart,String method){return "{\"cart_id\":"+cart+",\"order_source\":\"Online\",\"fulfillment_type\":\"Pickup\",\"branch_id\":1"+(method==null?"":",\"payment_method\":\""+method+"\"")+"}";}
    JsonNode order(String method) throws Exception {return data(call(post("/api/v1/orders").header("Idempotency-Key",UUID.randomUUID().toString()),customer,orderBody(cart(),method)).andExpect(status().isCreated()).andReturn());}
    JsonNode change(JsonNode order,String target,String auth) throws Exception {return data(call(patch("/api/v1/orders/"+order.path("id").asLong()+"/status"),auth,"{\"status\":\""+target+"\",\"version\":"+order.path("version").asInt()+",\"cancel_reason\":\"Test reason\"}").andExpect(status().isOk()).andReturn());}
    JsonNode payment(String id,long paymentId,long orderId,long amount) throws Exception{return json.readTree("{\"event_id\":\""+id+"\",\"payment_id\":"+paymentId+",\"branch_id\":1,\"amount\":"+amount+",\"allocations\":[{\"order_id\":"+orderId+",\"allocated_amount\":"+amount+"}]}");}

    @Test void cartCrudAndOwnership() throws Exception {
        cart();var result=call(get("/api/v1/carts/current?source=Online"),customer,null).andExpect(status().isOk()).andExpect(jsonPath("$.data.pricing.sub_total").value(80000)).andReturn();
        long item=data(result).path("items").get(0).path("id").asLong();
        call(get("/api/v1/carts/current?source=Online"),other,null).andExpect(status().isNotFound());
        call(put("/api/v1/carts/current/items/"+item+"?source=Online"),customer,"{\"quantity\":1,\"options\":[{\"option_id\":5}]}").andExpect(status().isOk()).andExpect(jsonPath("$.data.pricing.sub_total").value(35000));
        call(delete("/api/v1/carts/current/items/"+item+"?source=Online"),customer,null).andExpect(status().isNoContent());
        call(delete("/api/v1/carts/current?source=Online"),customer,null).andExpect(status().isNoContent());
        call(get("/api/v1/carts/current?source=Online"),customer,null).andExpect(status().isNotFound());
    }
    @Test void createCartReturnsExistingAndRejectsContextChange() throws Exception {
        long id=cart();call(post("/api/v1/carts"),customer,"{\"cart_source\":\"Online\",\"branch_id\":1,\"fulfillment_type\":\"Pickup\"}").andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(id));
        call(post("/api/v1/carts"),customer,"{\"cart_source\":\"Online\",\"branch_id\":2,\"fulfillment_type\":\"Pickup\"}").andExpect(status().isConflict());
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"Online,Pickup", "QR,Dine_In"})
    void addingIdenticalItemTwiceCreatesSeparateLines(String source,String fulfillment) throws Exception {
        String auth=source.equals("Online")?customer:null;
        var created=data(call(post("/api/v1/carts")
                .header("X-Table-Session-Code","session").header("X-Client-Key","duplicate-item-test"),auth,
                "{\"cart_source\":\""+source+"\",\"branch_id\":1,\"fulfillment_type\":\""+fulfillment+"\"}")
                .andExpect(status().isCreated()).andReturn());
        long cartId=created.path("id").asLong();
        String body="{\"variant_id\":1,\"quantity\":1,\"note\":\"same note\",\"options\":[{\"option_id\":5,\"quantity\":1}]}";
        for(int count=1;count<=2;count++) {
            call(post("/api/v1/carts/current/items?source="+source)
                    .header("X-Table-Session-Code","session").header("X-Client-Key","duplicate-item-test"),auth,body)
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.data.id").value(cartId))
                    .andExpect(jsonPath("$.data.items.length()").value(count));
        }
        var current=data(call(get("/api/v1/carts/current?source="+source)
                .header("X-Table-Session-Code","session").header("X-Client-Key","duplicate-item-test"),auth,null)
                .andExpect(status().isOk()).andReturn());
        var items=current.path("items");
        assertThat(items.size()).isEqualTo(2);
        assertThat(items.get(0).path("id").asLong()).isNotEqualTo(items.get(1).path("id").asLong());
        for(var item:items) {
            assertThat(item.path("variant_id").asInt()).isEqualTo(1);
            assertThat(item.path("quantity").asInt()).isEqualTo(1);
            assertThat(item.path("note").asText()).isEqualTo("same note");
        }
        assertThat(current.path("pricing").path("sub_total").asInt()).isEqualTo(70000);
        assertThat(jdbc.queryForObject("select count(*) from Cart_Items where cart_id=?",Long.class,cartId)).isEqualTo(2);
        assertThat(jdbc.queryForList("select quantity from Cart_Items where cart_id=? order by id",Integer.class,cartId))
                .containsExactly(1,1);
        System.out.println("Duplicate item verification ["+source+"]: "+current);
    }
    @Test void orderSnapshotIdempotencyAndAtomicConversion() throws Exception {
        long cart=cart();String body=orderBody(cart,null),key="checkout-key";
        var order=data(call(post("/api/v1/orders").header("Idempotency-Key",key),customer,body).andExpect(status().isCreated()).andExpect(jsonPath("$.data.final_amount").value(80000)).andExpect(jsonPath("$.data.items[0].line_total").value(80000)).andReturn());
        call(post("/api/v1/orders").header("Idempotency-Key",key),customer,body).andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(order.path("id").asLong()));
        call(post("/api/v1/orders").header("Idempotency-Key",key),customer,orderBody(cart,"VNPay")).andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("IDEMPOTENCY_CONFLICT"));
        call(post("/api/v1/orders").header("Idempotency-Key",key),other,body).andExpect(status().isConflict());
        assertThat(orders.count()).isEqualTo(1);assertThat(outbox.count()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select status from Carts where id=?",String.class,cart)).isEqualTo("Converted");
        var payload=outbox.findAll().get(0).payload;assertThat(payload).containsKeys("order_id","items");assertThat(payload).doesNotContainKey("delivery_address");
        call(get("/api/v1/orders/me/"+order.path("id").asLong()),other,null).andExpect(status().isNotFound());
        call(get("/api/v1/orders/me/"+order.path("id").asLong()),customer,null).andExpect(jsonPath("$.data.items[0].product_name").value("Ca phe"));
    }
    @Test void catalogFailureRollsBackOrderAndLeavesCartActive() throws Exception {
        long id=cart();when(dependencies.resolve(anyInt(),anyList())).thenThrow(new com.smart_cafe_ai.order_service.exception.ApiException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"CATALOG_UNAVAILABLE","Catalog unavailable"));
        call(post("/api/v1/orders").header("Idempotency-Key","fail"),customer,orderBody(id,null)).andExpect(status().isServiceUnavailable());
        assertThat(orders.count()).isZero();assertThat(outbox.count()).isZero();assertThat(jdbc.queryForObject("select status from Carts where id=?",String.class,id)).isEqualTo("Active");
    }
    @Test void outboxFailureRollsBackSavedOrderAndCartConversion() throws Exception {
        long id=cart();
        doAnswer(i->{i.callRealMethod();throw new com.smart_cafe_ai.order_service.exception.ApiException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"EVENT_WRITE_FAILED","Simulated persistence failure");}).when(eventWriter).emit(anyString(),any(),any(),any(),any());
        call(post("/api/v1/orders").header("Idempotency-Key","outbox-fail"),customer,orderBody(id,null)).andExpect(status().isServiceUnavailable());
        assertThat(orders.count()).isZero();assertThat(outbox.count()).isZero();assertThat(jdbc.queryForObject("select status from Carts where id=?",String.class,id)).isEqualTo("Active");
    }
    @Test void completedPaymentsForMultipleOrdersAreAppliedAtomically() throws Exception {
        long a=order("VNPay").path("id").asLong(),b=order("Momo").path("id").asLong();
        payments.accept("payment.succeeded",json.readTree("{\"event_id\":\"settlement\",\"payment_id\":11,\"branch_id\":1,\"amount\":160000,\"allocations\":[{\"order_id\":"+b+",\"allocated_amount\":80000},{\"order_id\":"+a+",\"allocated_amount\":80000}]}"));
        assertThat(orders.findById(a).orElseThrow().paymentStatus).isEqualTo(PaymentStatus.Paid);assertThat(orders.findById(b).orElseThrow().paymentStatus).isEqualTo(PaymentStatus.Paid);
        assertThatThrownBy(()->payments.accept("payment.refunded",json.readTree("{\"event_id\":\"invalid-refund\",\"refund_id\":12,\"amount\":100000,\"allocations\":[{\"order_id\":"+a+",\"amount\":10000},{\"order_id\":"+b+",\"amount\":90000}]}"))).isInstanceOf(IllegalArgumentException.class);
        assertThat(orders.findById(a).orElseThrow().paymentStatus).isEqualTo(PaymentStatus.Paid);assertThat(jdbc.queryForObject("select count(*) from Order_Payment_Entries",Long.class)).isEqualTo(2);
    }
    @Test void deliveryUsesBranchFeeAndRejectsOutsideRadius() throws Exception {
        long cartId=data(call(post("/api/v1/carts"),customer,"{\"cart_source\":\"Online\",\"branch_id\":1,\"fulfillment_type\":\"Delivery\"}").andExpect(status().isCreated()).andReturn()).path("id").asLong();
        call(post("/api/v1/carts/current/items?source=Online"),customer,"{\"variant_id\":1,\"quantity\":1}").andExpect(status().isCreated());
        String body="{\"cart_id\":"+cartId+",\"order_source\":\"Online\",\"branch_id\":1,\"fulfillment_type\":\"Delivery\",\"payment_method\":\"COD\",\"delivery_name\":\"Customer\",\"delivery_phone\":\"0901234567\",\"delivery_address\":\"Test address\",\"delivery_latitude\":10.8,\"delivery_longitude\":106.7}";
        call(post("/api/v1/orders").header("Idempotency-Key","outside"),customer,body.replace("10.8","11.8")).andExpect(status().isUnprocessableEntity());
        call(post("/api/v1/orders").header("Idempotency-Key","delivery"),customer,body).andExpect(status().isCreated()).andExpect(jsonPath("$.data.delivery_fee").value(15000)).andExpect(jsonPath("$.data.final_amount").value(45000)).andExpect(jsonPath("$.data.status").value("Pending"));
        assertThat(outbox.findAll().get(0).payload).doesNotContainKeys("delivery_name","delivery_phone","delivery_address");
    }
    @Test void storeClosedEventAbandonsQrCartsIdempotently() throws Exception {
        call(post("/api/v1/carts").header("X-Table-Session-Code","session").header("X-Client-Key","device"),null,"{\"cart_source\":\"QR\",\"branch_id\":1,\"fulfillment_type\":\"Dine_In\"}").andExpect(status().isCreated());
        var event=json.readTree("{\"event_id\":\"session-closed\",\"table_session_id\":11,\"status\":\"Completed\"}");payments.accept("store.table_session.closed",event);payments.accept("store.table_session.closed",event);
        assertThat(jdbc.queryForObject("select status from Carts",String.class)).isEqualTo("Abandoned");assertThat(jdbc.queryForObject("select count(*) from Processed_Events",Long.class)).isEqualTo(1);
        when(dependencies.sessionByCode("session")).thenReturn(new Session(11L,1,"Completed",null));
        call(post("/api/v1/carts").header("X-Table-Session-Code","session").header("X-Client-Key","device"),null,"{\"cart_source\":\"QR\",\"branch_id\":1,\"fulfillment_type\":\"Dine_In\"}").andExpect(status().isUnprocessableEntity());
    }
    @Test void stateMachineVersionAndPaidCompletion() throws Exception {
        var order=order(null);long id=order.path("id").asLong();
        call(patch("/api/v1/orders/"+id+"/status"),staff,"{\"status\":\"Ready\",\"version\":0}").andExpect(status().isConflict());
        order=change(order,"Confirmed",staff);
        call(patch("/api/v1/orders/"+id+"/status"),staff,"{\"status\":\"Preparing\",\"version\":0}").andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
        call(patch("/api/v1/orders/"+id+"/status"),customer,"{\"status\":\"Cancelled\",\"cancel_reason\":\"late\",\"version\":1}").andExpect(status().isForbidden());
        order=change(order,"Preparing",staff);order=change(order,"Ready",staff);
        call(patch("/api/v1/orders/"+id+"/status"),staff,"{\"status\":\"Completed\",\"version\":"+order.path("version").asInt()+"}").andExpect(status().isUnprocessableEntity());
        payments.accept("payment.succeeded",payment("paid",9,id,80000));
        order=data(call(get("/api/v1/orders/"+id),staff,null).andReturn());order=change(order,"Completed",staff);
        assertThat(order.path("completed_at").isNull()).isFalse();
        call(get("/api/v1/orders/"+id+"/history"),customer,null).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(5));
        call(get("/api/v1/orders/reports/sales?from=2000-01-01&to=2000-01-02"),staff,null).andExpect(status().isForbidden());
        String today=LocalDate.now(ZoneOffset.UTC).toString();
        call(get("/api/v1/orders/reports/sales?from="+today+"&to="+today),manager,null).andExpect(status().isOk()).andExpect(jsonPath("$.data[0].final_amount").value(80000));
        call(get("/api/v1/orders/reports/top-products?from="+today+"&to="+today),manager,null).andExpect(status().isOk()).andExpect(jsonPath("$.data[0].quantity_sold").value(2));
    }
    @Test void cancellationNeedsReasonAndRejectEmitsReleaseEvent() throws Exception {
        var order=order(null);long id=order.path("id").asLong();
        call(patch("/api/v1/orders/"+id+"/status"),customer,"{\"status\":\"Cancelled\",\"version\":0}").andExpect(status().isBadRequest());
        order=change(order,"Rejected",staff);assertThat(order.path("cancel_reason").asText()).isEqualTo("Test reason");
        assertThat(outbox.findAll().stream().map(e->e.eventType)).containsExactly("order.created","order.status_changed","order.cancelled");
    }
    @Test void paymentPartialDeduplicationAndRefunds() throws Exception {
        var order=order("VNPay");long id=order.path("id").asLong();assertThat(order.path("status").asText()).isEqualTo("Pending_Payment");
        var first=payment("pay-1",10,id,30000);payments.accept("payment.succeeded",first);payments.accept("payment.succeeded",first);
        payments.accept("payment.succeeded",payment("same-business-new-id",10,id,30000));
        assertThat(orders.findById(id).orElseThrow().paymentStatus).isEqualTo(PaymentStatus.Unpaid);
        payments.accept("payment.succeeded",payment("pay-2",11,id,50000));
        assertThat(orders.findById(id).orElseThrow().paymentStatus).isEqualTo(PaymentStatus.Paid);assertThat(orders.findById(id).orElseThrow().status).isEqualTo(Status.Pending);
        payments.accept("payment.refunded",json.readTree("{\"event_id\":\"refund-1\",\"refund_id\":1,\"payment_id\":10,\"amount\":20000,\"allocations\":[{\"order_id\":"+id+",\"amount\":20000}]}"));
        assertThat(orders.findById(id).orElseThrow().paymentStatus).isEqualTo(PaymentStatus.Partially_Refunded);
        payments.accept("payment.refunded",json.readTree("{\"event_id\":\"refund-2\",\"refund_id\":2,\"payment_id\":11,\"amount\":60000,\"allocations\":[{\"order_id\":"+id+",\"amount\":60000}]}"));
        assertThat(orders.findById(id).orElseThrow().paymentStatus).isEqualTo(PaymentStatus.Refunded);
        assertThat(jdbc.queryForObject("select count(*) from Order_Payment_Entries",Long.class)).isEqualTo(4);
    }
    @Test void invalidPaymentRollsBackWholeSettlement() throws Exception {
        var order=order("Momo");long id=order.path("id").asLong();
        assertThatThrownBy(()->payments.accept("payment.succeeded",payment("too-much",10,id,80001))).isInstanceOf(IllegalArgumentException.class);
        assertThat(orders.findById(id).orElseThrow().paymentStatus).isEqualTo(PaymentStatus.Unpaid);
        assertThat(jdbc.queryForObject("select count(*) from Processed_Events",Long.class)).isZero();assertThat(jdbc.queryForObject("select count(*) from Order_Payment_Entries",Long.class)).isZero();
    }
    @Test void repaymentAfterRefundUsesNetBalance() throws Exception {
        long id=order(null).path("id").asLong();payments.accept("payment.succeeded",payment("initial-payment",21,id,80000));
        payments.accept("payment.refunded",json.readTree("{\"event_id\":\"refund-balance\",\"refund_id\":22,\"payment_id\":21,\"amount\":20000,\"allocations\":[{\"order_id\":"+id+",\"amount\":20000}]}"));
        assertThat(orders.findById(id).orElseThrow().paymentStatus).isEqualTo(PaymentStatus.Partially_Refunded);
        payments.accept("payment.succeeded",payment("repayment",23,id,20000));assertThat(orders.findById(id).orElseThrow().paymentStatus).isEqualTo(PaymentStatus.Paid);
        assertThatThrownBy(()->payments.accept("payment.succeeded",payment("overpayment",24,id,1))).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void customerCanCancelOwnPendingOrder() throws Exception {
        var order=order(null);long id=order.path("id").asLong();
        call(patch("/api/v1/orders/"+id+"/status"),other,"{\"status\":\"Cancelled\",\"cancel_reason\":\"cancel\",\"version\":0}").andExpect(status().isNotFound());
        order=change(order,"Cancelled",customer);assertThat(order.path("cancelled_by").asText()).isEqualTo("customer-1");assertThat(order.path("status").asText()).isEqualTo("Cancelled");
    }
    @Test void expiryAndLatePaymentNeverReopenCancelledOrder() throws Exception {
        var order=order("VNPay");long id=order.path("id").asLong();jdbc.update("update Orders set expires_at=? where id=?",LocalDateTime.now(ZoneOffset.UTC).minusMinutes(1),id);
        expiry.expire(id);expiry.expire(id);assertThat(orders.findById(id).orElseThrow().status).isEqualTo(Status.Cancelled);
        payments.accept("payment.succeeded",payment("late",10,id,80000));assertThat(orders.findById(id).orElseThrow().status).isEqualTo(Status.Cancelled);assertThat(orders.findById(id).orElseThrow().paymentStatus).isEqualTo(PaymentStatus.Paid);
        assertThat(outbox.count()).isEqualTo(3);
    }
    @Test void qrCartIsolationSessionAndOrderAccess() throws Exception {
        String create="{\"cart_source\":\"QR\",\"branch_id\":1,\"fulfillment_type\":\"Dine_In\"}";
        long id=data(call(post("/api/v1/carts").header("X-Table-Session-Code","session").header("X-Client-Key","device-1"),null,create).andExpect(status().isCreated()).andReturn()).path("id").asLong();
        call(post("/api/v1/carts/current/items?source=QR").header("X-Table-Session-Code","session").header("X-Client-Key","device-1"),null,"{\"variant_id\":1,\"quantity\":1}").andExpect(status().isCreated());
        call(get("/api/v1/carts/current?source=QR").header("X-Table-Session-Code","session").header("X-Client-Key","device-2"),null,null).andExpect(status().isNotFound());
        String body="{\"cart_id\":"+id+",\"order_source\":\"QR\",\"branch_id\":1,\"fulfillment_type\":\"Dine_In\"}";
        var order=data(call(post("/api/v1/orders").header("Idempotency-Key","qr-key").header("X-Table-Session-Code","session").header("X-Client-Key","device-1"),null,body).andExpect(status().isCreated()).andReturn());
        call(get("/api/v1/orders/table-session").header("X-Table-Session-Code","session"),null,null).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1));
        call(get("/api/v1/orders/table-session/"+order.path("id").asLong()).header("X-Table-Session-Code","other-session"),null,null).andExpect(status().isNotFound());
        call(get("/api/v1/orders/table-session/"+order.path("id").asLong()).header("X-Table-Session-Code","session"),null,null).andExpect(status().isOk());
    }
    @Test void posAndBranchAuthorization() throws Exception {
        String body="{\"order_source\":\"POS\",\"branch_id\":1,\"fulfillment_type\":\"Dine_In\",\"table_session_id\":11,\"items\":[{\"variant_id\":1,\"quantity\":1}]}";
        call(post("/api/v1/orders").header("Idempotency-Key","pos-customer"),customer,body).andExpect(status().isForbidden());
        var order=data(call(post("/api/v1/orders").header("Idempotency-Key","pos-staff"),staff,body).andExpect(status().isCreated()).andExpect(jsonPath("$.data.created_by").value("staff-1")).andReturn());
        when(dependencies.staff("staff-1")).thenReturn(new Staff("staff-1",2,"Active"));
        call(get("/api/v1/orders/"+order.path("id").asLong()),staff,null).andExpect(status().isForbidden());
        call(get("/api/v1/orders?branch_id=1"),staff,null).andExpect(status().isForbidden());
        call(get("/api/v1/orders/"+order.path("id").asLong()),admin,null).andExpect(status().isOk());
    }
    @Test void paginationFiltersSummaryAndInternalAuthentication() throws Exception {
        var order=order(null);long id=order.path("id").asLong();
        call(get("/api/v1/orders/me?status=Pending&size=1"),customer,null).andExpect(status().isOk()).andExpect(jsonPath("$.meta.total").value(1));
        call(get("/api/v1/orders?order_source=QR"),staff,null).andExpect(status().isOk()).andExpect(jsonPath("$.meta.total").value(0));
        call(get("/api/v1/orders/summary"),staff,null).andExpect(status().isOk()).andExpect(jsonPath("$.data.total_orders").value(1));
        call(get("/internal/orders/"+id),null,null).andExpect(status().isUnauthorized());
        call(get("/internal/orders/"+id).header("X-Service-Key","wrong"),null,null).andExpect(status().isForbidden());
        call(get("/internal/orders/"+id).header("X-Service-Key","test-internal-key"),null,null).andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(id));
        call(get("/internal/orders/by-table-session/11").header("X-Service-Key","test-internal-key"),null,null).andExpect(status().isOk());
        call(get("/api/v1/orders/me?sort=secret,desc"),customer,null).andExpect(status().isBadRequest());
        call(get("/api/v1/orders/me?size=101"),customer,null).andExpect(status().isBadRequest());
    }
    @Test void validationDoesNotTrustPricesOrInvalidOptions() throws Exception {
        cart();
        for(String body:List.of("{\"variant_id\":1,\"quantity\":0}","{\"variant_id\":1,\"quantity\":1.5}","{\"variant_id\":1,\"quantity\":1,\"unit_price\":1}","{\"variant_id\":1,\"quantity\":1,\"options\":[null]}","{\"variant_id\":1,\"quantity\":1,\"options\":[{\"option_id\":5},{\"option_id\":5}]}"))
            call(post("/api/v1/carts/current/items?source=Online"),customer,body).andExpect(status().isBadRequest());
        call(get("/api/v1/orders/me"),null,null).andExpect(status().isUnauthorized());
        call(get("/api/v1/orders/me"),"Bearer bad",null).andExpect(status().isUnauthorized());
    }
    @Test void unconfiguredEngagementDoesNotCreateUndiscountedOrder() throws Exception {
        long id=cart();String body=orderBody(id,null).replace("}",",\"voucher_code\":\"WELCOME\"}");
        call(post("/api/v1/orders").header("Idempotency-Key","voucher"),customer,body).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.error.code").value("ENGAGEMENT_INTEGRATION_NOT_CONFIGURED"));assertThat(orders.count()).isZero();
    }
    void enableBenefits(){doNothing().when(engagement).requireConfigured();}
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"explicit,50000,90000", "default,20000,120000"})
    void rewardSelectionUsesRequestedLineOrCheapestBase(String selection,int discount,int amount) throws Exception {
        enableBenefits();long id=cart();
        call(post("/api/v1/carts/current/items?source=Online"),customer,"{\"variant_id\":2,\"quantity\":1}").andExpect(status().isCreated());
        when(dependencies.resolve(anyInt(),anyList())).thenAnswer(call->{
            List<com.smart_cafe_ai.order_service.dto.Requests.Item> lines=call.getArgument(1);
            return lines.stream().map(line->new ResolvedItem(line.variantId(),10,"Coffee","M",
                    new BigDecimal(line.variantId()==1?"50000":"20000"),line.options().stream().map(o->new ResolvedOption(o.optionId(),"Topping",new BigDecimal("5000"),o.quantity())).toList())).toList();
        });
        String body=orderBody(id,null).replace("}",",\"redeem_reward\":true"+(selection.equals("explicit")?",\"reward_item_index\":0":"")+"}");
        call(post("/api/v1/orders").header("Idempotency-Key","selection-"+selection),customer,body)
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.item_discount_amount").value(discount))
                .andExpect(jsonPath("$.data.final_amount").value(amount));
    }
    @Test void voucherAndRewardUseServerPricesSplitOneCupAndReplayWithoutSecondCommand() throws Exception {
        enableBenefits();long cart=cart();
        when(engagement.apply(eq("SAVE"),eq("customer-1"),anyLong(),eq(1),eq("Pickup"),eq(new BigDecimal("50000")))).thenReturn(new BigDecimal("10000"));
        String body=orderBody(cart,null).replace("}",",\"voucher_code\":\"save\",\"redeem_reward\":true}");
        var created=data(call(post("/api/v1/orders").header("Idempotency-Key","benefits-ok"),customer,body)
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.sub_total").value(80000))
                .andExpect(jsonPath("$.data.item_discount_amount").value(30000))
                .andExpect(jsonPath("$.data.voucher_discount_amount").value(10000))
                .andExpect(jsonPath("$.data.final_amount").value(40000)).andReturn());
        long id=created.path("id").asLong();
        var reward=created.path("items").findValues("is_reward_item");
        assertThat(reward.stream().filter(JsonNode::asBoolean).count()).isEqualTo(1);
        for(var item:created.path("items"))if(item.path("is_reward_item").asBoolean()) {
            assertThat(item.path("quantity").asInt()).isEqualTo(1);assertThat(item.path("line_total").asInt()).isEqualTo(10000);
        }
        call(post("/api/v1/orders").header("Idempotency-Key","benefits-ok"),customer,body).andExpect(status().isOk());
        verify(engagement,times(1)).redeem("customer-1",id);
        verify(engagement,times(1)).apply("SAVE","customer-1",id,1,"Pickup",new BigDecimal("50000"));
        verify(engagement,never()).reverse(anyString(),anyLong());
        assertThat(checkouts.findById(id).orElseThrow().status).isEqualTo("Committed");
        assertThat(outbox.count()).isEqualTo(1);
    }
    @Test void rejectedVoucherAfterRedeemRollsBackOrderAndCompensatesBothBenefits() throws Exception {
        enableBenefits();long id=cart();
        when(engagement.apply(anyString(),anyString(),anyLong(),anyInt(),anyString(),any())).thenThrow(
                new com.smart_cafe_ai.order_service.exception.ApiException(org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,"VOUCHER_EXPIRED","Expired"));
        String body=orderBody(id,null).replace("}",",\"voucher_code\":\"OLD\",\"redeem_reward\":true}");
        call(post("/api/v1/orders").header("Idempotency-Key","benefits-fail"),customer,body)
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.error.code").value("VOUCHER_EXPIRED"));
        assertThat(orders.count()).isZero();assertThat(outbox.count()).isZero();
        assertThat(jdbc.queryForObject("select status from Carts where id=?",String.class,id)).isEqualTo("Active");
        var attempt=checkouts.findAll().get(0);assertThat(attempt.status).isEqualTo("Reversed");
        verify(engagement).redeem("customer-1",attempt.orderId);verify(engagement).reverse("customer-1",attempt.orderId);
    }
    @Test void persistenceFailureAfterRemoteSuccessAlsoCompensates() throws Exception {
        enableBenefits();long id=cart();
        doAnswer(i->{throw new IllegalStateException("DB write failed");}).when(eventWriter).emit(anyString(),any(),any(),any(),any());
        String body=orderBody(id,null).replace("}",",\"redeem_reward\":true}");
        call(post("/api/v1/orders").header("Idempotency-Key","benefits-db-fail"),customer,body).andExpect(status().isInternalServerError());
        assertThat(orders.count()).isZero();assertThat(checkouts.findAll().get(0).status).isEqualTo("Reversed");
        verify(engagement).reverse(eq("customer-1"),anyLong());
    }
    @Test void durableCompensationSurvivesRollbackAndRetriesAfterOutage() {
        enableBenefits();
        new org.springframework.transaction.support.TransactionTemplate(transactions).executeWithoutResult(tx->{recovery.begin(999999L,"customer-1");tx.setRollbackOnly();});
        assertThat(checkouts.existsById(999999L)).isTrue();
        doThrow(new IllegalStateException("offline")).when(engagement).reverse("customer-1",999999L);
        recovery.recover(999999L);
        var row=checkouts.findById(999999L).orElseThrow();assertThat(row.status).isEqualTo("Pending");assertThat(row.retryCount).isEqualTo(1);
        doNothing().when(engagement).reverse("customer-1",999999L);recovery.recover(999999L);
        assertThat(checkouts.findById(999999L).orElseThrow().status).isEqualTo("Reversed");
    }
    @Test void invalidRewardSelectionMakesNoRemoteMutation() throws Exception {
        enableBenefits();long id=cart();
        String body=orderBody(id,null).replace("}",",\"redeem_reward\":true,\"reward_item_index\":10}");
        call(post("/api/v1/orders").header("Idempotency-Key","bad-reward"),customer,body).andExpect(status().isBadRequest());
        verify(engagement,never()).redeem(anyString(),anyLong());assertThat(orders.count()).isZero();assertThat(checkouts.count()).isZero();
    }
    @Test void concurrentCheckoutConvertsCartExactlyOnce() throws Exception {
        long id=cart();String body=orderBody(id,null);var start=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);
        try{
            Callable<Integer> work=()->{start.await();return call(post("/api/v1/orders").header("Idempotency-Key",UUID.randomUUID().toString()),customer,body).andReturn().getResponse().getStatus();};
            var a=pool.submit(work);var b=pool.submit(work);start.countDown();assertThat(List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder(201,409);assertThat(orders.count()).isEqualTo(1);assertThat(outbox.count()).isEqualTo(1);
        }finally{pool.shutdownNow();}
    }
}
