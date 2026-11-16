package com.smart_cafe_ai.order_service.integration;

import java.math.BigDecimal;

public interface EngagementClient {
    void requireConfigured();
    void redeem(String user,Long order);
    BigDecimal apply(String code,String user,Long order,Integer branch,String fulfillment,BigDecimal amount);
    void reverse(String user,Long order);
}
