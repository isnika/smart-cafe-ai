package com.smart_cafe_ai.engagement_service.service;

import com.smart_cafe_ai.engagement_service.exception.ApiException;
import com.smart_cafe_ai.engagement_service.model.OrderBenefitState;
import com.smart_cafe_ai.engagement_service.repository.OrderBenefitStateRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** Serializes checkout commands and cancellation, including commands arriving after a timeout. */
@Service @Transactional(propagation=Propagation.MANDATORY)
public class OrderBenefitGuard {
    private final OrderBenefitStateRepository states;
    public OrderBenefitGuard(OrderBenefitStateRepository states) { this.states=states; }

    private OrderBenefitState lock(Long order,String user) {
        var row=states.lock(order).orElseGet(()->{
            var state=new OrderBenefitState();state.orderId=order;state.userId=user;
            return states.saveAndFlush(state);
        });
        if(user!=null&&row.userId!=null&&!user.equals(row.userId)) throw ApiException.conflict("Đơn hàng đã gắn với tài khoản khác.");
        if(row.userId==null&&user!=null) row.userId=user;
        return row;
    }
    public void requireActive(Long order,String user) {
        if(!"Active".equals(lock(order,user).status)) throw ApiException.conflict("Đơn hàng đã kết thúc hoặc ưu đãi đã được hoàn tác.");
    }
    public void requireNotReversed(Long order,String user) {
        if("Reversed".equals(lock(order,user).status)) throw ApiException.conflict("Ưu đãi của đơn hàng đã được hoàn tác.");
    }
    public boolean completed(Long order,String user) {
        var row=lock(order,user);
        if("Reversed".equals(row.status)) return false;
        row.status="Completed";return true;
    }
    public void reversed(Long order,String user) { lock(order,user).status="Reversed"; }
}
