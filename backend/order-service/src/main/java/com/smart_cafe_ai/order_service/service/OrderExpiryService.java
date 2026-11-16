package com.smart_cafe_ai.order_service.service;
import com.smart_cafe_ai.order_service.model.Types.Status;
import com.smart_cafe_ai.order_service.repository.OrderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
@Service
public class OrderExpiryService {
    public OrderExpiryService(OrderRepository orders, OrderService service) {
        this.orders=orders;
        this.service=service;
    }

    private final OrderRepository orders;
    private final OrderService service;
    @Transactional public void expire(Long id){
        var order=orders.lock(id).orElse(null);
        if(order!=null&&order.status==Status.Pending_Payment&&order.expiresAt!=null&&!order.expiresAt.isAfter(LocalDateTime.now(ZoneOffset.UTC)))service.transition(order,Status.Cancelled,null,"Tự động hết hạn thanh toán","PAYMENT_TIMEOUT");
    }
}
