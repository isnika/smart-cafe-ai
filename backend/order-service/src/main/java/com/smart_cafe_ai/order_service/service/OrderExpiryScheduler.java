package com.smart_cafe_ai.order_service.service;
import com.smart_cafe_ai.order_service.model.Types.Status;
import com.smart_cafe_ai.order_service.repository.OrderRepository;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.*;
@Component @ConditionalOnProperty(name="app.order.expiry-enabled",havingValue="true",matchIfMissing=true)
public class OrderExpiryScheduler {
    private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(OrderExpiryScheduler.class);
    public OrderExpiryScheduler(OrderRepository orders, OrderExpiryService service) {
        this.orders=orders;
        this.service=service;
    }

    private final OrderRepository orders;
    private final OrderExpiryService service;
    @Scheduled(fixedDelayString="${app.order.expiry-delay-ms:30000}") public void expire(){
        for(Long id:orders.expired(Status.Pending_Payment,LocalDateTime.now(ZoneOffset.UTC),PageRequest.of(0,100))){
            try{service.expire(id);}catch(Exception ex){log.warn("Order expiry deferred: id={}, error={}",id,ex.getClass().getSimpleName());}
        }
    }
}
