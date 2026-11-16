package com.smart_cafe_ai.order_service.service;

import com.smart_cafe_ai.order_service.exception.ApiException;
import com.smart_cafe_ai.order_service.integration.OrderDependencies.*;
import com.smart_cafe_ai.order_service.model.Types.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.springframework.http.HttpStatus.*;

public final class OrderPolicy {
    private OrderPolicy() {}
    public static void shape(Source source,Fulfillment fulfillment){
        if(source==null||fulfillment==null)throw ApiException.invalid("Cần nguồn đơn và hình thức phục vụ.");
        boolean valid=switch(source){case Online->fulfillment!=Fulfillment.Dine_In;case QR->fulfillment==Fulfillment.Dine_In;case POS->fulfillment!=Fulfillment.Delivery;};
        if(!valid)throw ApiException.invalid("Nguồn đơn không phù hợp hình thức phục vụ.");
    }
    public static void active(Session s,boolean writing){
        if(!(s.status().equals("Active")||(!writing&&s.status().equals("Payment_Pending")))||s.expiresAt()!=null&&!s.expiresAt().isAfter(LocalDateTime.now(ZoneOffset.UTC)))
            throw new ApiException(UNPROCESSABLE_ENTITY,"TABLE_SESSION_CLOSED","Phiên bàn không còn nhận đơn hoặc đã hết hạn.");
    }
    public static void branch(Branch b,Source source){
        if(!"Active".equals(b.status())||(source==Source.Online&&!b.acceptsOnlineOrders()))rule("Chi nhánh không nhận đơn ở nguồn đã chọn.");
        if(b.openingTime()!=null&&b.closingTime()!=null&&!b.openingTime().equals(b.closingTime())){
            LocalTime now=LocalTime.now(ZoneId.of(b.timezone()==null?"Asia/Ho_Chi_Minh":b.timezone()));
            boolean open=b.openingTime().isBefore(b.closingTime())? !now.isBefore(b.openingTime())&&now.isBefore(b.closingTime()):!now.isBefore(b.openingTime())||now.isBefore(b.closingTime());
            if(!open)rule("Chi nhánh đang ngoài giờ phục vụ.");
        }
    }
    public static BigDecimal delivery(Branch b,BigDecimal lat,BigDecimal lon){
        if(b.deliveryRadiusKm()==null||b.deliveryRadiusKm().signum()<=0)rule("Chi nhánh không phục vụ giao hàng.");
        if(lat==null||lon==null||b.latitude()==null||b.longitude()==null)throw ApiException.invalid("Giao hàng cần tọa độ giao và tọa độ chi nhánh.");
        double a1=Math.toRadians(b.latitude().doubleValue()),a2=Math.toRadians(lat.doubleValue());
        double da=a2-a1,dl=Math.toRadians(lon.subtract(b.longitude()).doubleValue());
        double h=Math.pow(Math.sin(da/2),2)+Math.cos(a1)*Math.cos(a2)*Math.pow(Math.sin(dl/2),2);
        if(6371*2*Math.asin(Math.sqrt(Math.min(1,h)))>b.deliveryRadiusKm().doubleValue())rule("Địa chỉ nằm ngoài bán kính giao hàng.");
        return b.deliveryFee();
    }
    public static void transition(Status from,Status to,Fulfillment f,boolean customer){
        if(customer){if(to!=Status.Cancelled||!(from==Status.Pending||from==Status.Pending_Payment))throw ApiException.forbidden();return;}
        Set<Status> targets=switch(from){
            case Pending_Payment -> Set.of(Status.Cancelled);
            case Pending -> Set.of(Status.Confirmed,Status.Rejected,Status.Cancelled);
            case Confirmed -> Set.of(Status.Preparing,Status.Cancelled);
            case Preparing -> Set.of(Status.Ready);
            case Ready -> Set.of(switch(f){case Delivery->Status.Shipping;case Pickup->Status.Completed;case Dine_In->Status.Served;});
            case Shipping,Served -> Set.of(Status.Completed);
            default -> Set.of();
        };
        if(!targets.contains(to))throw ApiException.conflict("INVALID_STATE_TRANSITION","Không thể chuyển từ "+from+" sang "+to+".");
    }
    public static void rule(String message){throw new ApiException(UNPROCESSABLE_ENTITY,"BUSINESS_RULE_VIOLATION",message);}
}
