package com.smart_cafe_ai.engagement_service.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderBenefitService {
    private final OrderBenefitGuard guard;
    private final LoyaltyService loyalty;
    private final VoucherService vouchers;
    public OrderBenefitService(OrderBenefitGuard guard,LoyaltyService loyalty,VoucherService vouchers) {
        this.guard=guard;this.loyalty=loyalty;this.vouchers=vouchers;
    }
    @Transactional
    public void reverse(Long order,String user) {
        // Persist the tombstone even when a timed-out apply/redeem has not arrived yet.
        guard.reversed(order,user);
        loyalty.reverse(order);
        vouchers.reverse(order);
    }
}
