package com.smart_cafe_ai.order_service.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.smart_cafe_ai.order_service.model.*;
import com.smart_cafe_ai.order_service.model.Types.*;
import com.smart_cafe_ai.order_service.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

@Service
public class PaymentEventService {
    public PaymentEventService(OrderRepository orders, PaymentEntryRepository entries, ProcessedEventRepository processed, CartRepository carts, OrderService orderService) {
        this.orders=orders;
        this.entries=entries;
        this.processed=processed;
        this.carts=carts;
        this.orderService=orderService;
    }

    private final OrderRepository orders;
    private final PaymentEntryRepository entries;
    private final ProcessedEventRepository processed;
    private final CartRepository carts;
    private final OrderService orderService;
    @Transactional public void accept(String type,JsonNode body){
        String eventId=text(body,"event_id",36);
        if(body.has("event_type")&&!type.equals(body.path("event_type").asText()))throw invalid();
        if(processed.existsById(eventId))return;
        if(type.startsWith("payment."))payment(type,body,eventId);
        else if(type.equals("store.table_session.closed")){
            String status=text(body,"status",20);if(!Set.of("Completed","Cancelled").contains(status))throw invalid();
            carts.abandonSession(positive(body,"table_session_id"));
        }else if(!type.equals("store.branch.status_changed"))throw invalid();
        // Branch state is checked synchronously on every command, so no stale branch cache is trusted.
        var event=new ProcessedEvent();event.eventId=eventId;event.eventType=type;event.sourceService=type.startsWith("payment.")?"payment-service":"store-service";processed.saveAndFlush(event);
    }
    private void payment(String type,JsonNode body,String eventId){
        if(!Set.of("payment.succeeded","payment.refunded","payment.failed","payment.expired").contains(type))throw invalid();
        var allocations=body.path("allocations");if(!allocations.isArray()||allocations.isEmpty()||allocations.size()>100)throw invalid();
        var sorted=new TreeMap<Long,JsonNode>();for(var a:allocations)if(sorted.put(positive(a,"order_id"),a)!=null)throw invalid();
        // Lock in a stable order for settlements spanning multiple orders. Recheck dedupe after waiting.
        var locked=new LinkedHashMap<Long,CafeOrder>();for(Long id:sorted.keySet())locked.put(id,orders.lock(id).orElseThrow(PaymentEventService::invalid));
        if(processed.existsById(eventId))return;
        boolean refund=type.equals("payment.refunded"),success=type.equals("payment.succeeded");
        String businessId=(success||refund)?Long.toString(positive(body,refund?"refund_id":"payment_id")):null;
        BigDecimal allocatedTotal=BigDecimal.ZERO;
        for(var entry:sorted.entrySet()){
            var order=locked.get(entry.getKey());
            if(body.has("branch_id")&&positive(body,"branch_id")!=order.branchId.longValue())throw invalid();
            if(!success&&!refund){
                // A failed/expired payment attempt must not cancel a newer successful attempt.
                if(type.equals("payment.expired")&&order.status==Status.Pending_Payment&&order.expiresAt!=null&&!order.expiresAt.isAfter(LocalDateTime.now(ZoneOffset.UTC)))orderService.transition(order,Status.Cancelled,null,"Hết hạn thanh toán","PAYMENT_EXPIRED");
                continue;
            }
            BigDecimal amount=amount(entry.getValue(),refund?"amount":"allocated_amount");allocatedTotal=allocatedTotal.add(amount);
            String entryKey=(refund?"refund:":"payment:")+businessId+":"+order.id;
            var old=entries.findById(entryKey);
            if(old.isPresent()){
                if(old.get().amount.compareTo(amount)!=0)throw invalid();continue;
            }
            BigDecimal paid=BigDecimal.ZERO,refunded=BigDecimal.ZERO;
            for(var allocation:entries.findByOrderId(order.id)){if(allocation.entryType.equals("Payment"))paid=paid.add(allocation.amount);else refunded=refunded.add(allocation.amount);}
            if(refund)refunded=refunded.add(amount);else paid=paid.add(amount);
            BigDecimal netPaid=paid.subtract(refunded);
            if(netPaid.compareTo(order.finalAmount)>0||refunded.compareTo(paid)>0)throw invalid();
            var payment=new PaymentEntry();payment.entryKey=entryKey;payment.orderId=order.id;payment.entryType=refund?"Refund":"Payment";payment.amount=amount;entries.save(payment);
            order.paymentStatus=netPaid.compareTo(order.finalAmount)>=0?PaymentStatus.Paid:
                    refunded.signum()>0?(netPaid.signum()==0?PaymentStatus.Refunded:PaymentStatus.Partially_Refunded):PaymentStatus.Unpaid;
            if(order.status==Status.Pending_Payment&&order.paymentStatus==PaymentStatus.Paid)orderService.transition(order,Status.Pending,null,"Thanh toán thành công",null);
            // Late money after cancellation is recorded; order never reopens. Payment owns the refund obligation.
        }
        if((success||refund)&&allocatedTotal.compareTo(amount(body,"amount"))!=0)throw invalid();
    }
    private static String text(JsonNode node,String name,int max){var v=node.path(name);if(!v.isTextual()||v.asText().isBlank()||v.asText().length()>max)throw invalid();return v.asText();}
    private static long positive(JsonNode node,String name){var v=node.path(name);if(!v.isIntegralNumber()||!v.canConvertToLong()||v.longValue()<=0)throw invalid();return v.longValue();}
    private static BigDecimal amount(JsonNode node,String name){var v=node.path(name);if(!v.isNumber())throw invalid();var amount=v.decimalValue();if(amount.signum()<=0||amount.stripTrailingZeros().scale()>0||amount.precision()-amount.scale()>15)throw invalid();return amount;}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Invalid or inconsistent integration event; inspect DLQ and replay after correction");}
}
