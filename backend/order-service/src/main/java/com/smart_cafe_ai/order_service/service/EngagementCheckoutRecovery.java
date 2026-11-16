package com.smart_cafe_ai.order_service.service;

import com.smart_cafe_ai.order_service.integration.EngagementClient;
import com.smart_cafe_ai.order_service.model.EngagementCheckout;
import com.smart_cafe_ai.order_service.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.time.*;

@Service
public class EngagementCheckoutRecovery {
    private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(EngagementCheckoutRecovery.class);
    private final EngagementCheckoutRepository attempts;
    private final OrderRepository orders;
    private final EngagementClient engagement;
    public EngagementCheckoutRecovery(EngagementCheckoutRepository attempts,OrderRepository orders,EngagementClient engagement) {
        this.attempts=attempts;this.orders=orders;this.engagement=engagement;
    }
    // This record must survive the outer checkout's rollback and exists before any remote side effect.
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void begin(Long order,String user) {
        var row=new EngagementCheckout();row.orderId=order;row.userId=user;attempts.saveAndFlush(row);
    }
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void recover(Long order) {
        var row=attempts.lock(order).orElse(null);
        if(row==null||!"Pending".equals(row.status))return;
        if(orders.existsById(order)) { row.status="Committed";row.lastError=null;return; }
        try {
            engagement.reverse(row.userId,row.orderId);
            row.status="Reversed";row.lastError=null;
        } catch(Exception ex) {
            row.retryCount++;row.lastError=ex.getClass().getSimpleName();
            row.nextRetryAt=LocalDateTime.now(ZoneOffset.UTC).plusSeconds(Math.min(300,1L<<Math.min(row.retryCount,8)));
            log.warn("Checkout compensation deferred: orderId={}, attempt={}",order,row.retryCount);
        }
    }
}
