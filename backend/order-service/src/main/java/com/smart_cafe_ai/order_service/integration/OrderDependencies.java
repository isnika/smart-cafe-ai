package com.smart_cafe_ai.order_service.integration;

import com.smart_cafe_ai.order_service.dto.Requests.Item;
import com.smart_cafe_ai.order_service.model.Types.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.List;

/** Synchronous contracts. Store routes are proposals to agree with Backend 2; see README. */
public interface OrderDependencies {
    record Branch(Integer id,String status,boolean acceptsOnlineOrders,BigDecimal deliveryFee,
                  BigDecimal deliveryRadiusKm,BigDecimal latitude,BigDecimal longitude,
                  String timezone,LocalTime openingTime,LocalTime closingTime) {}
    record Session(Long id,Integer branchId,String status,LocalDateTime expiresAt) {}
    record Staff(String userId,Integer branchId,String status) {}
    record ResolvedOption(Integer optionId,String optionName,BigDecimal extraPrice,int quantity) {}
    record ResolvedItem(Integer variantId,Integer productId,String productName,String variantName,
                        BigDecimal price,List<ResolvedOption> options) {}
    Branch branch(Integer id);
    Session sessionByCode(String code);
    Session sessionById(Long id);
    Staff staff(String userId);
    List<ResolvedItem> resolve(Integer branchId,List<Item> items);
    void requireCustomer(String userId);
}
