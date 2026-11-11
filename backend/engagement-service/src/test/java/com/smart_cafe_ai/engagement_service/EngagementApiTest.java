package com.smart_cafe_ai.engagement_service;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.smart_cafe_ai.engagement_service.dto.Requests.*;
import com.smart_cafe_ai.engagement_service.exception.ApiException;
import com.smart_cafe_ai.engagement_service.repository.*;
import com.smart_cafe_ai.engagement_service.service.*;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @ActiveProfiles("test") @AutoConfigureMockMvc
class EngagementApiTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired LoyaltyService loyalty;
    @Autowired VoucherService voucherService;
    @Autowired LoyaltyCardRepository cards;
    @Autowired LoyaltyTransactionRepository transactions;
    @Autowired VoucherRepository vouchers;
    @Autowired VoucherRedemptionRepository redemptions;
    @Autowired VerifiedPurchaseRepository purchases;
    @Autowired OutboxEventRepository outbox;
    @Autowired ProcessedEventRepository processed;
    @Autowired EngagementEventService events;
    @Autowired CustomerNotificationService notifications;
    @Autowired NotificationService otpNotifications;
    @Autowired NotificationRepository notificationRepository;
    @Value("${jwt.secret}") String secret;
    @MockBean JavaMailSender mailSender;

    @BeforeEach void clean() {
        for(String table:List.of("order_benefit_state","product_reviews","verified_purchases","voucher_redemptions","vouchers","loyalty_transactions","loyalty_cards","device_tokens","notifications","outbox_events","processed_events")) jdbc.update("DELETE FROM "+table);
    }
    private String token(String user,String role) {
        return Jwts.builder().subject(user).claim("role",role).claim("branch_id",1).expiration(Date.from(Instant.now().plusSeconds(3600)))
                .signWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode(secret))).compact();
    }
    private MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder request,String user,String role) { return request.header("Authorization","Bearer "+token(user,role)); }
    private JsonNode result(ResultActions response) throws Exception { return json.readTree(response.andReturn().getResponse().getContentAsString()); }
    private MockHttpServletRequestBuilder body(MockHttpServletRequestBuilder request,Object value) throws Exception { return request.contentType("application/json").content(json.writeValueAsBytes(value)); }
    private ObjectNode event(String type) {
        var n=json.createObjectNode(); n.put("event_id",UUID.randomUUID().toString()); n.put("event_type",type); n.put("event_version",1); n.put("occurred_at",Instant.now().toString()); return n;
    }
    private ObjectNode completed(long order,long item,int quantity) {
        var n=event("order.completed"); n.put("order_id",order); n.put("user_id","customer"); n.put("branch_id",1);
        n.putArray("items").addObject().put("order_item_id",item).put("product_id",10).put("quantity",quantity).put("is_reward_item",false);
        return n;
    }
    private Map<String,Object> voucher(String code,int total) {
        return Map.of("code",code,"name","Ưu đãi thử nghiệm","discount_type","Percent","discount_value",20,"max_discount_amount",15000,
                "starts_at",Instant.now().minusSeconds(60).toString(),"ends_at",Instant.now().plusSeconds(3600).toString(),"usage_limit_total",total,"usage_limit_per_user",1);
    }
    private JsonNode createVoucher(String code,int total) throws Exception {
        return result(mvc.perform(body(auth(post("/api/v1/vouchers"),"admin","Admin"),voucher(code,total))).andExpect(status().isCreated())).get("data");
    }
    @Test void loyaltyApisSupportAdjustmentRedemptionReplayAndOwnership() throws Exception {
        // Existing loyalty endpoints continue to work independently of Order checkout.
        mvc.perform(get("/api/v1/loyalty/me")).andExpect(status().isUnauthorized());
        mvc.perform(auth(get("/api/v1/loyalty/me"),"customer","Customer")).andExpect(status().isOk()).andExpect(jsonPath("$.data.current_stamps").value(0));
        var adjustment=Map.of("user_id","customer","stamps",20,"note","Bù tem");
        mvc.perform(body(auth(post("/api/v1/loyalty/adjustments"),"customer","Customer"),adjustment)).andExpect(status().isForbidden());
        mvc.perform(body(auth(post("/api/v1/loyalty/adjustments"),"admin","Admin"),adjustment).header("Idempotency-Key","adjust-1")).andExpect(status().isCreated());
        mvc.perform(body(auth(post("/api/v1/loyalty/adjustments"),"admin","Admin"),adjustment).header("Idempotency-Key","adjust-1")).andExpect(status().isOk());
        var redeem=Map.of("user_id","customer","order_id",1,"idempotency_key","redeem-1");
        mvc.perform(body(post("/api/v1/internal/loyalty/redeem"),redeem)).andExpect(status().isUnauthorized());
        mvc.perform(body(auth(post("/api/v1/internal/loyalty/redeem"),"customer","Customer"),redeem)).andExpect(status().isUnauthorized());
        mvc.perform(body(post("/api/v1/internal/loyalty/redeem"),redeem).header("X-Service-Key","test-service-key")).andExpect(status().isCreated()).andExpect(jsonPath("$.data.transaction.stamps").value(-10));
        mvc.perform(body(post("/api/v1/internal/loyalty/redeem"),redeem).header("X-Service-Key","test-service-key")).andExpect(status().isOk());
        mvc.perform(auth(get("/api/v1/loyalty/me/transactions").param("transaction_type","Redeem"),"customer","Customer")).andExpect(jsonPath("$.meta.total").value(1));
        mvc.perform(auth(get("/api/v1/loyalty/me/transactions"),"other","Customer")).andExpect(jsonPath("$.meta.total").value(0));
        assertEquals(10,cards.findByUserId("customer").orElseThrow().currentStamps);
        assertEquals(1,outbox.count());
    }
    @Test void checkoutCompensationRestoresBenefitsAndBlocksLateCommands() throws Exception {
        loyalty.adjust(new Adjustment("customer",20,"Opening balance"),"admin","balance");
        createVoucher("CHECKOUT",10);
        loyalty.redeem(new Redeem("customer",501L,"order:501:reward"));
        voucherService.apply(new ApplyVoucher("CHECKOUT","customer",501L,1,com.smart_cafe_ai.engagement_service.model.Types.Fulfillment.Pickup,new java.math.BigDecimal("50000")));
        var reverse=Map.of("user_id","customer","order_id",501);
        mvc.perform(body(post("/api/v1/internal/benefits/reverse"),reverse)).andExpect(status().isUnauthorized());
        for(int i=0;i<2;i++)mvc.perform(body(post("/api/v1/internal/benefits/reverse"),reverse).header("X-Service-Key","test-service-key"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("Reversed"));
        assertEquals(20,cards.findByUserId("customer").orElseThrow().currentStamps);
        assertEquals(0,vouchers.findByCodeIgnoreCase("CHECKOUT").orElseThrow().usedCount);
        assertThrows(ApiException.class,()->loyalty.redeem(new Redeem("customer",501L,"order:501:reward")));
        assertThrows(ApiException.class,()->voucherService.apply(new ApplyVoucher("CHECKOUT","customer",501L,1,com.smart_cafe_ai.engagement_service.model.Types.Fulfillment.Pickup,new java.math.BigDecimal("50000"))));
        events.consume(completed(501,5011,1),null);
        assertTrue(purchases.findById(5011L).isEmpty());
        assertEquals(20,cards.findByUserId("customer").orElseThrow().currentStamps);
    }
    @Test void compensationBeforeAnyCommandPreventsLateTimeoutRequestFromSpendingStamps() throws Exception {
        loyalty.adjust(new Adjustment("customer",10,"Opening balance"),"admin","balance");
        mvc.perform(body(post("/api/v1/internal/benefits/reverse"),Map.of("user_id","customer","order_id",777)).header("X-Service-Key","test-service-key")).andExpect(status().isOk());
        assertThrows(ApiException.class,()->loyalty.redeem(new Redeem("customer",777L,"order:777:reward")));
        assertEquals(10,cards.findByUserId("customer").orElseThrow().currentStamps);
    }
    @Test void concurrentRedemptionsCannotSpendTheSameStamps() throws Exception {
        loyalty.adjust(new Adjustment("customer",10,"Initial"),"admin",null);
        var start=new CountDownLatch(1); var pool=Executors.newFixedThreadPool(2);
        try {
            List<Future<Boolean>> attempts=new ArrayList<>();
            for(long i=1;i<=2;i++) { long order=i; attempts.add(pool.submit(()->{start.await(); try {loyalty.redeem(new Redeem("customer",order,"key-"+order)); return true;} catch(ApiException ex) {assertEquals("INSUFFICIENT_STAMPS",ex.code); return false;} })); }
            start.countDown(); int success=0; for(var attempt:attempts) if(attempt.get(10,TimeUnit.SECONDS)) success++;
            assertEquals(1,success); assertEquals(0,cards.findByUserId("customer").orElseThrow().currentStamps);
        } finally { pool.shutdownNow(); }
    }
    @Test void voucherApisValidateWithoutSpendingThenApplyExactlyOnce() throws Exception {
        var v=createVoucher("CAFE20",1); long id=v.path("id").asLong();
        mvc.perform(auth(get("/api/v1/vouchers"),"admin","Admin")).andExpect(jsonPath("$.meta.total").value(1));
        mvc.perform(auth(get("/api/v1/vouchers/available").param("branch_id","1").param("order_amount","100000").param("fulfillment_type","Pickup"),"customer","Customer")).andExpect(jsonPath("$.data.length()").value(1));
        var context=Map.of("code","CAFE20","branch_id",1,"fulfillment_type","Pickup","order_amount",100000);
        mvc.perform(body(auth(post("/api/v1/vouchers/validate"),"customer","Customer"),context)).andExpect(jsonPath("$.data.valid").value(true)).andExpect(jsonPath("$.data.discount_amount").value(15000));
        assertEquals(0,redemptions.count());
        var apply=new HashMap<String,Object>(context); apply.put("user_id","customer"); apply.put("order_id",5);
        mvc.perform(body(post("/api/v1/internal/vouchers/apply"),apply).header("X-Service-Key","test-service-key")).andExpect(status().isCreated());
        mvc.perform(body(post("/api/v1/internal/vouchers/apply"),apply).header("X-Service-Key","test-service-key")).andExpect(status().isOk());
        apply.put("order_amount",99999);
        mvc.perform(body(post("/api/v1/internal/vouchers/apply"),apply).header("X-Service-Key","test-service-key")).andExpect(status().isConflict());
        apply.put("order_id",6); apply.put("user_id","other");
        mvc.perform(body(post("/api/v1/internal/vouchers/apply"),apply).header("X-Service-Key","test-service-key")).andExpect(status().isUnprocessableEntity());
        assertEquals(1,vouchers.findById(id).orElseThrow().usedCount);
        var edit=new HashMap<>(voucher("CAFE20",2)); edit.put("name","Tên mới");
        mvc.perform(body(auth(put("/api/v1/vouchers/"+id),"admin","Admin"),edit)).andExpect(status().isOk());
        mvc.perform(body(auth(patch("/api/v1/vouchers/"+id+"/status"),"admin","Admin"),Map.of("status","Inactive"))).andExpect(jsonPath("$.data.status").value("Inactive"));
    }
    @Test void verifiedReviewsArePrivateUntilModeratedAndCannotBeForged() throws Exception {
        var complete=completed(10,100,2); events.consume(complete,null); events.consume(complete,null);
        assertEquals(2,cards.findByUserId("customer").orElseThrow().currentStamps); assertEquals(1,purchases.count());
        var review=Map.of("order_item_id",100,"product_id",10,"rating",5,"comment","Ngon");
        mvc.perform(body(auth(post("/api/v1/reviews"),"other","Customer"),review)).andExpect(status().isForbidden());
        var created=result(mvc.perform(body(auth(post("/api/v1/reviews"),"customer","Customer"),review)).andExpect(status().isCreated())); long id=created.path("data").path("id").asLong();
        mvc.perform(body(auth(post("/api/v1/reviews"),"customer","Customer"),review)).andExpect(status().isConflict());
        mvc.perform(get("/api/v1/reviews").param("product_id","10")).andExpect(jsonPath("$.meta.total").value(0));
        mvc.perform(auth(get("/api/v1/reviews/me"),"customer","Customer")).andExpect(jsonPath("$.meta.total").value(1));
        mvc.perform(auth(get("/api/v1/reviews/admin").param("status","Pending"),"manager","Manager")).andExpect(jsonPath("$.meta.total").value(1));
        mvc.perform(body(auth(patch("/api/v1/reviews/"+id+"/status"),"manager","Manager"),Map.of("status","Approved"))).andExpect(status().isOk()).andExpect(jsonPath("$.data.moderated_by").value("manager"));
        mvc.perform(get("/api/v1/reviews").param("product_id","10")).andExpect(jsonPath("$.data[0].rating").value(5));
        assertEquals(2,outbox.count());
    }
    @Test void deviceAndNotificationApisEnforceOwnershipAndHideSensitiveFields() throws Exception {
        var registered=result(mvc.perform(body(auth(post("/api/v1/device-tokens"),"customer","Customer"),Map.of("platform","Web","token","secret-push-token"))).andExpect(status().isCreated()).andExpect(jsonPath("$.data.token").doesNotExist()));
        long id=registered.path("data").path("id").asLong();
        mvc.perform(auth(delete("/api/v1/device-tokens/"+id),"other","Customer")).andExpect(status().isNotFound());
        mvc.perform(auth(delete("/api/v1/device-tokens/"+id),"customer","Customer")).andExpect(status().isNoContent());
        var e=event("order.status_changed"); e.put("order_id",11); e.put("user_id","customer"); e.put("status","Preparing");
        events.consume(e,null); events.consume(e,null);
        var list=result(mvc.perform(auth(get("/api/v1/notifications/me"),"customer","Customer")).andExpect(jsonPath("$.meta.total").value(1)).andExpect(jsonPath("$.data[0].recipient").doesNotExist()));
        long notificationId=list.path("data").get(0).path("id").asLong();
        mvc.perform(body(auth(patch("/api/v1/notifications/"+notificationId+"/read"),"other","Customer"),Map.of("is_read",true))).andExpect(status().isNotFound());
        mvc.perform(body(auth(patch("/api/v1/notifications/"+notificationId+"/read"),"customer","Customer"),Map.of("is_read",true))).andExpect(jsonPath("$.data.is_read").value(true));
        notifications.inApp("customer","promotion","Ưu đãi","Mời bạn ghé quán",Map.of());
        mvc.perform(auth(post("/api/v1/notifications/read-all"),"customer","Customer")).andExpect(jsonPath("$.data.updated_count").value(1));
        mvc.perform(auth(get("/api/v1/notifications/me").param("is_read","false"),"customer","Customer")).andExpect(jsonPath("$.meta.total").value(0));
    }
    @Test void cancellationAndRefundReverseLoyaltyAndVoucherOnlyOnce() throws Exception {
        // Checkout spends stamps earned on an earlier order, before this order completes.
        events.consume(completed(19,190,12),null);
        loyalty.redeem(new Redeem("customer",20L,"reward-20"));
        createVoucher("REVERSE",1);
        mvc.perform(body(post("/api/v1/internal/vouchers/apply"),Map.of("code","REVERSE","user_id","customer","order_id",20,"branch_id",1,"fulfillment_type","Pickup","order_amount",100000)).header("X-Service-Key","test-service-key")).andExpect(status().isCreated());
        events.consume(completed(20,200,12),null);
        var cancel=event("order.cancelled"); cancel.put("order_id",20); events.consume(cancel,null);
        var refund=event("payment.refunded"); refund.putArray("allocations").addObject().put("order_id",20).put("reverse_loyalty",true); events.consume(refund,null);
        assertEquals(12,cards.findByUserId("customer").orElseThrow().currentStamps);
        assertEquals(0,vouchers.findByCodeIgnoreCase("REVERSE").orElseThrow().usedCount);
        assertEquals(5,transactions.count());
    }
    @Test void invalidEventsRollBackAllEffectsAndGuestsDoNotEarn() {
        var invalid=completed(30,300,51);
        assertThrows(ApiException.class,()->events.consume(invalid,null));
        assertEquals(0,purchases.count()); assertEquals(0,processed.count()); assertEquals(0,cards.count()); assertEquals(0,outbox.count());
        var guest=completed(31,301,2); guest.putNull("user_id"); events.consume(guest,null);
        assertEquals(0,purchases.count()); assertEquals(0,cards.count());
    }
    @Test void malformedInputsAndBranchRestrictionsReturnContractErrors() throws Exception {
        mvc.perform(get("/api/v1/reviews")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        mvc.perform(auth(get("/api/v1/loyalty/me/transactions").param("size","101"),"customer","Customer")).andExpect(status().isBadRequest());
        mvc.perform(body(auth(post("/api/v1/loyalty/adjustments"),"admin","Admin"),Map.of("user_id","customer","stamps",0,"note","Zero"))).andExpect(status().isBadRequest());
        mvc.perform(body(auth(post("/api/v1/vouchers"),"manager","Manager"),voucher("GLOBAL",2))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/loyalty/me").header("Authorization","Bearer broken")).andExpect(status().isUnauthorized());
        mvc.perform(auth(post("/api/v1/reviews"),"customer","Customer").contentType("application/json").content("{\"order_item_id\":1,\"product_id\":1,\"rating\":4.9}")).andExpect(status().isBadRequest());
        mvc.perform(auth(post("/api/v1/device-tokens"),"customer","Customer").contentType("application/json").content("{\"platform\":\"Web\",\"token\":\"test\",\"user_id\":\"other\"}")).andExpect(status().isBadRequest());
    }
    @Test void concurrentVoucherApplicationsRespectTheLastAvailableUse() throws Exception {
        createVoucher("LAST",1);
        var start=new CountDownLatch(1); var pool=Executors.newFixedThreadPool(2);
        try {
            List<Future<Boolean>> attempts=new ArrayList<>();
            for(long i=1;i<=2;i++) {
                long order=i;
                attempts.add(pool.submit(()->{ start.await(); try {
                    voucherService.apply(new ApplyVoucher("LAST","user-"+order,order,1,com.smart_cafe_ai.engagement_service.model.Types.Fulfillment.Pickup,new java.math.BigDecimal("100000"))); return true;
                } catch(ApiException ex) { assertEquals("BUSINESS_RULE_VIOLATION",ex.code); return false; } }));
            }
            start.countDown(); int success=0; for(var attempt:attempts) if(attempt.get(10,TimeUnit.SECONDS)) success++;
            assertEquals(1,success); assertEquals(1,redemptions.count()); assertEquals(1,vouchers.findByCodeIgnoreCase("LAST").orElseThrow().usedCount);
        } finally { pool.shutdownNow(); }
    }
    @Test void rewardItemsDoNotEarnAndRefundFlagsAreRespected() {
        var n=completed(40,400,10);
        n.withArray("items").addObject().put("order_item_id",401).put("product_id",11).put("quantity",1).put("is_reward_item",true);
        events.consume(n,null); assertEquals(10,cards.findByUserId("customer").orElseThrow().currentStamps); assertEquals(2,purchases.count());
        loyalty.redeem(new Redeem("customer",41L,"different-order"));
        var refund=event("payment.refunded"); refund.putArray("allocations").addObject().put("order_id",40).put("reverse_loyalty",false);
        events.consume(refund,null); assertEquals(0,cards.findByUserId("customer").orElseThrow().currentStamps);
        var cancel=event("order.cancelled"); cancel.put("order_id",40); events.consume(cancel,null);
        assertEquals(-10,cards.findByUserId("customer").orElseThrow().currentStamps);
        assertEquals(10,cards.findByUserId("customer").orElseThrow().lifetimeStampsEarned);
    }
    @Test void otpDeliveryDoesNotOverwriteConcurrentReadStatus() {
        var event=new com.smart_cafe_ai.engagement_service.dto.OtpEmailEvent(UUID.randomUUID().toString(),"customer","test@example.com","123456","Register",Instant.now().plusSeconds(300));
        var mime=new jakarta.mail.internet.MimeMessage(jakarta.mail.Session.getInstance(new Properties()));
        org.mockito.Mockito.when(mailSender.createMimeMessage()).thenReturn(mime);
        org.mockito.Mockito.doAnswer(invocation->{
            var row=notificationRepository.findByEventId(event.eventId()).orElseThrow(); notifications.read("customer",row.getId(),true); return null;
        }).when(mailSender).send(org.mockito.ArgumentMatchers.any(jakarta.mail.internet.MimeMessage.class));
        otpNotifications.sendOtpEmail(event);
        var row=notificationRepository.findByEventId(event.eventId()).orElseThrow();
        assertTrue(row.isRead()); assertEquals(com.smart_cafe_ai.engagement_service.model.Notification.Status.SENT,row.getStatus());
    }
}
