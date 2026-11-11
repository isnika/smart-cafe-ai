package com.smart_cafe_ai.engagement_service.service;
import com.fasterxml.jackson.databind.JsonNode;
import com.smart_cafe_ai.engagement_service.exception.ApiException;
import com.smart_cafe_ai.engagement_service.model.*;
import com.smart_cafe_ai.engagement_service.repository.*;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
@Service
public class EngagementEventService {
    private final ProcessedEventRepository processed;
    private final VerifiedPurchaseRepository purchases;
    private final LoyaltyService loyalty;
    private final VoucherService vouchers;
    private final CustomerNotificationService notifications;
    private final OrderBenefitService benefits;
    private final OrderBenefitGuard benefitGuard;
    public EngagementEventService(ProcessedEventRepository processed,VerifiedPurchaseRepository purchases,LoyaltyService loyalty,VoucherService vouchers,CustomerNotificationService notifications,OrderBenefitService benefits,OrderBenefitGuard benefitGuard) {
        this.processed=processed; this.purchases=purchases; this.loyalty=loyalty; this.vouchers=vouchers; this.notifications=notifications;
        this.benefits=benefits;this.benefitGuard=benefitGuard;
    }
    @Transactional
    public void consume(JsonNode envelope,String headerType) {
        if(envelope==null||!envelope.isObject()) throw ApiException.invalid("Event phải là JSON object.");
        JsonNode body=envelope.has("payload")?envelope.get("payload"):envelope;
        if(!body.isObject()) throw ApiException.invalid("payload phải là JSON object.");
        String id=text(envelope,"event_id"); if(id==null) id=text(body,"event_id");
        try { if(!UUID.fromString(id).toString().equalsIgnoreCase(id)) throw new IllegalArgumentException(); }
        catch(Exception ex) { throw ApiException.invalid("event_id phải là UUID."); }
        String type=text(envelope,"event_type"); if(type==null) type=text(body,"event_type"); if(type==null) type=headerType;
        if(type==null||!Set.of("order.completed","order.cancelled","order.status_changed","payment.refunded","payment.failed","invoice.issued").contains(type)) throw ApiException.invalid("event_type không được hỗ trợ.");
        if(headerType!=null&&!headerType.equals(type)) throw ApiException.invalid("event_type không khớp message type.");
        if(envelope.has("event_version")&&(!envelope.get("event_version").isIntegralNumber()||envelope.get("event_version").asInt()!=1)) throw ApiException.invalid("event_version chưa được hỗ trợ.");
        var old=processed.findById(id);
        if(old.isPresent()) { if(!old.get().eventType.equals(type)) throw ApiException.conflict("event_id đã được dùng cho loại sự kiện khác."); return; }
        var row=new ProcessedEvent(); row.eventId=id; row.eventType=type; row.sourceService=type.startsWith("order.")?"order-service":"payment-service";
        processed.saveAndFlush(row);
        String correlation=text(envelope,"correlation_id"); if(correlation==null||!correlation.matches("[a-zA-Z0-9_-]{1,64}")) correlation=id;
        try(var ignored=MDC.putCloseable("trace_id",correlation)) {
            switch(type) {
                case "order.completed" -> completed(body,envelope);
                case "order.cancelled" -> benefits.reverse(number(body,"order_id"),user(body));
                case "order.status_changed" -> {
                    String user=user(body); Long order=number(body,"order_id"); String status=requiredText(body,"status",50);
                    notifications.inApp(user,"order_status","Cập nhật đơn hàng","Đơn hàng #"+order+": "+status,Map.of("order_id",order,"status",status));
                }
                case "payment.refunded" -> refunded(body);
                case "payment.failed" -> paymentFailed(body);
                case "invoice.issued" -> invoice(body);
                default -> throw new IllegalStateException();
            }
        }
    }
    private void completed(JsonNode body,JsonNode envelope) {
        String user=user(body); if(user==null) return;
        Long order=number(body,"order_id"); int branch=integer(body,"branch_id"); Instant purchasedAt=timestamp(body,envelope);
        if(!benefitGuard.completed(order,user)) return;
        JsonNode items=array(body,"items"); if(items.isEmpty()) throw ApiException.invalid("order.completed cần items.");
        Set<Long> seen=new HashSet<>(); int stamps=0;
        for(var item:items) {
            Long itemId=number(item,"order_item_id"); int product=integer(item,"product_id"); int quantity=integer(item,"quantity");
            if(!seen.add(itemId)) throw ApiException.invalid("order_item_id bị lặp trong event.");
            var old=purchases.findById(itemId);
            if(old.isPresent()) {
                var p=old.get(); if(!p.orderId.equals(order)||!p.userId.equals(user)||p.productId!=product||p.branchId!=branch) throw ApiException.conflict("Danh tính verified purchase không khớp.");
            } else {
                var p=new VerifiedPurchase(); p.orderItemId=itemId; p.orderId=order; p.userId=user; p.productId=product; p.branchId=branch; p.purchasedAt=purchasedAt; purchases.save(p);
            }
            // Current Order snapshots include is_reward_item. Non-drinks can explicitly set loyalty_eligible=false.
            boolean eligible=!item.has("loyalty_eligible")||bool(item,"loyalty_eligible");
            if(eligible) {
                if(!item.has("is_reward_item")) throw ApiException.invalid("Thiếu is_reward_item để tính tem an toàn.");
                if(!bool(item,"is_reward_item")) stamps=Math.addExact(stamps,quantity);
            }
        }
        loyalty.earn(user,order,stamps);
    }
    private void refunded(JsonNode body) {
        for(var allocation:array(body,"allocations")) {
            Long order=number(allocation,"order_id"); if(bool(allocation,"reverse_loyalty")) benefits.reverse(order,user(allocation));
        }
    }
    private void paymentFailed(JsonNode body) {
        Long payment=number(body,"payment_id"); String direct=user(body); var recipients=new HashSet<String>(); if(direct!=null) recipients.add(direct);
        for(var allocation:array(body,"allocations")) {
            String user=user(allocation); if(user!=null) recipients.add(user);
            for(var p:purchases.findByOrderId(number(allocation,"order_id"))) recipients.add(p.userId);
        }
        for(String recipient:recipients) notifications.inApp(recipient,"payment_failed","Thanh toán thất bại","Giao dịch #"+payment+" chưa thanh toán thành công.",Map.of("payment_id",payment));
        if(recipients.isEmpty()) org.slf4j.LoggerFactory.getLogger(getClass()).info("payment.failed has no known account recipient; paymentId={}",payment);
    }
    private void invoice(JsonNode body) {
        Long invoice=number(body,"invoice_id"); String direct=user(body); var recipients=new HashSet<String>(); if(direct!=null) recipients.add(direct);
        for(var order:array(body,"order_ids")) {
            if(!order.isIntegralNumber()||!order.canConvertToLong()||order.longValue()<=0) throw ApiException.invalid("order_ids không hợp lệ.");
            for(var p:purchases.findByOrderId(order.longValue())) recipients.add(p.userId);
        }
        var data=new LinkedHashMap<String,Object>(); data.put("invoice_id",invoice); data.put("invoice_number",text(body,"invoice_number")); data.put("pdf_url",text(body,"pdf_url"));
        for(String recipient:recipients) notifications.inApp(recipient,"invoice","Hóa đơn đã được phát hành","Hóa đơn #"+invoice+" đã sẵn sàng.",data);
        if(recipients.isEmpty()) org.slf4j.LoggerFactory.getLogger(getClass()).info("invoice.issued has no known account recipient; invoiceId={}",invoice);
    }
    private String user(JsonNode node) { return optionalText(node,"user_id",36); }
    private String text(JsonNode node,String name) { return optionalText(node,name,500); }
    private String optionalText(JsonNode node,String name,int max) {
        var v=node.get(name); if(v==null||v.isNull()) return null;
        if(!v.isTextual()||v.textValue().isBlank()||v.textValue().length()>max) throw ApiException.invalid(name+" không hợp lệ."); return v.textValue();
    }
    private String requiredText(JsonNode node,String name,int max) { String v=optionalText(node,name,max); if(v==null) throw ApiException.invalid("Thiếu "+name); return v; }
    private Long number(JsonNode node,String name) {
        var n=node.get(name); if(n==null||!n.isIntegralNumber()||!n.canConvertToLong()||n.longValue()<=0) throw ApiException.invalid(name+" phải là số nguyên dương."); return n.longValue();
    }
    private int integer(JsonNode node,String name) { long n=number(node,name); if(n>Integer.MAX_VALUE) throw ApiException.invalid(name+" vượt giới hạn."); return (int)n; }
    private boolean bool(JsonNode node,String name) { var n=node.get(name); if(n==null||!n.isBoolean()) throw ApiException.invalid(name+" phải là boolean."); return n.booleanValue(); }
    private JsonNode array(JsonNode node,String name) { var n=node.get(name); if(n==null||!n.isArray()) throw ApiException.invalid(name+" phải là array."); return n; }
    private Instant timestamp(JsonNode body,JsonNode envelope) {
        String value=text(body,"purchased_at"); if(value==null) value=text(body,"completed_at"); if(value==null) value=text(envelope,"occurred_at"); if(value==null) value=text(body,"occurred_at");
        if(value==null) throw ApiException.invalid("Thiếu thời điểm hoàn tất mua hàng.");
        try { return Instant.parse(value); }
        catch(java.time.format.DateTimeParseException ex) {
            try { return LocalDateTime.parse(value).toInstant(ZoneOffset.UTC); }
            catch(java.time.format.DateTimeParseException invalid) { throw ApiException.invalid("Thời gian event không hợp lệ."); }
        }
    }
}
