package com.smart_cafe_ai.order_service.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.order_service.dto.Requests.*;
import com.smart_cafe_ai.order_service.exception.ApiException;
import com.smart_cafe_ai.order_service.integration.OrderDependencies;
import com.smart_cafe_ai.order_service.integration.EngagementClient;
import com.smart_cafe_ai.order_service.model.*;
import com.smart_cafe_ai.order_service.model.Types.*;
import com.smart_cafe_ai.order_service.repository.*;
import com.smart_cafe_ai.order_service.security.Access;
import com.smart_cafe_ai.order_service.security.Access.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.math.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import static org.springframework.http.HttpStatus.*;

@Service @Transactional
public class OrderService {
    public OrderService(OrderRepository orders, CartService carts, Access access, OrderDependencies dependencies, OrderEvents events, ObjectMapper json,EngagementClient engagement,EngagementCheckoutRecovery recovery) {
        this.orders=orders;
        this.carts=carts;
        this.access=access;
        this.dependencies=dependencies;
        this.events=events;
        this.json=json;
        this.engagement=engagement;this.recovery=recovery;
    }

    private final OrderRepository orders;
    private final CartService carts;
    private final Access access;
    private final OrderDependencies dependencies;
    private final OrderEvents events;
    private final ObjectMapper json;
    private final EngagementClient engagement;
    private final EngagementCheckoutRecovery recovery;
    private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(OrderService.class);
    @Value("${app.order.payment-timeout-minutes:15}") private int paymentTimeout;
    @Value("${app.order.vat-rate:0}") private BigDecimal vatRate;
    public record Created(Object order,boolean replay) {}
    @Transactional(timeout=60)
    public Created create(CreateOrder r,String key,Context context){
        if(key==null||key.isBlank()||key.length()>64)throw ApiException.invalid("Idempotency-Key bắt buộc, dài 1–64 ký tự.");
        OrderPolicy.shape(r.orderSource(),r.fulfillmentType());
        String owner=switch(r.orderSource()){
            case Online -> "Online:"+access.customer(context).userId();
            case POS -> "POS:"+access.staff(context).userId();
            case QR -> {
                if(context.actor()!=null)access.customer(context);
                if(context.sessionCode()==null||context.sessionCode().isBlank()||context.sessionCode().length()>50)throw ApiException.invalid("QR cần X-Table-Session-Code.");
                yield "QR:"+hash(context.sessionCode()+":"+access.client(context));
            }
        };
        String requestHash;
        try{
            com.fasterxml.jackson.databind.node.ObjectNode canonical=json.valueToTree(r);
            // Preserve hashes of requests created before reward_item_index was introduced.
            if(r.rewardItemIndex()==null)canonical.remove("reward_item_index");
            requestHash=hash(json.writeValueAsString(canonical));
        }catch(Exception ex){throw ApiException.invalid("Không thể đọc yêu cầu đặt hàng.");}
        var previous=orders.findByIdempotencyKey(key);
        if(previous.isPresent()){
            var old=previous.get();
            if(!owner.equals(old.requestOwner)||!requestHash.equals(old.requestHash))throw ApiException.conflict("IDEMPOTENCY_CONFLICT","Idempotency-Key đã được dùng cho yêu cầu khác.");
            if(r.orderSource()==Source.POS)requireBranch(context,old.branchId);
            return new Created(events.snapshot(old),true);
        }
        boolean benefits=r.voucherCode()!=null||r.redeemReward();
        if(r.voucherCode()!=null&&r.voucherCode().isBlank())throw ApiException.invalid("voucher_code không được rỗng.");
        if(!r.redeemReward()&&r.rewardItemIndex()!=null)throw ApiException.invalid("reward_item_index chỉ dùng khi redeem_reward=true.");
        if(benefits)engagement.requireConfigured();
        var branch=dependencies.branch(r.branchId());OrderPolicy.branch(branch,r.orderSource());
        Cart cart=null;List<Item> lines;Long sessionId=null;String userId=null,createdBy=null;
        if(r.orderSource()==Source.POS){
            requireBranch(context,r.branchId());createdBy=access.staff(context).userId();
            if(r.cartId()!=null||r.items().isEmpty())throw ApiException.invalid("POS cần items và không dùng cart_id.");
            lines=r.items();userId=r.userId();if(userId!=null){if(userId.isBlank())throw ApiException.invalid("user_id không được rỗng.");dependencies.requireCustomer(userId);}
            if(r.fulfillmentType()==Fulfillment.Dine_In){
                if(r.tableSessionId()==null)throw ApiException.invalid("Dine_In cần table_session_id.");
                var s=dependencies.sessionById(r.tableSessionId());OrderPolicy.active(s,true);
                if(!r.branchId().equals(s.branchId()))throw ApiException.forbidden();sessionId=s.id();
            }
        }else{
            if(!r.items().isEmpty())throw ApiException.invalid("Online/QR lấy items từ cart_id.");
            cart=carts.checkout(r.cartId(),context);
            if(cart.cartSource!=r.orderSource()||cart.fulfillmentType!=r.fulfillmentType()||!cart.branchId.equals(r.branchId()))throw ApiException.invalid("Đơn phải khớp nguồn, chi nhánh và hình thức của giỏ.");
            lines=CartService.lines(cart);sessionId=cart.tableSessionId;
            userId=r.orderSource()==Source.Online?access.customer(context).userId():context.actor()==null?null:context.actor().userId();
            if(r.userId()!=null&&!Objects.equals(r.userId(),userId))throw ApiException.forbidden();
            if(r.tableSessionId()!=null&&!r.tableSessionId().equals(sessionId))throw ApiException.forbidden();
        }
        if(r.fulfillmentType()!=Fulfillment.Dine_In&&r.tableSessionId()!=null)throw ApiException.invalid("Chỉ Dine_In được gắn phiên bàn.");
        if(benefits&&userId==null)throw ApiException.invalid("Cần gắn tài khoản khách hàng để dùng voucher hoặc đổi tem.");
        if(lines.isEmpty()||lines.size()>100)throw ApiException.invalid("Đơn cần 1–100 dòng.");lines.forEach(i->CartService.validateOptions(i.options()));
        var method=r.paymentMethod();
        if(method==PaymentMethod.COD&&r.fulfillmentType()!=Fulfillment.Delivery)throw ApiException.invalid("COD chỉ dành cho Delivery.");
        if(method==PaymentMethod.Cash&&r.fulfillmentType()==Fulfillment.Delivery)throw ApiException.invalid("Delivery dùng COD hoặc cổng thanh toán.");
        var order=new CafeOrder();order.idempotencyKey=key;order.requestHash=requestHash;order.requestOwner=owner;
        order.orderCode="SC"+UUID.randomUUID().toString().replace("-","").substring(0,18).toUpperCase(Locale.ROOT);
        order.userId=userId;order.createdBy=createdBy;order.branchId=r.branchId();order.tableSessionId=sessionId;
        order.orderSource=r.orderSource();order.fulfillmentType=r.fulfillmentType();order.note=r.note();
        if(r.fulfillmentType()==Fulfillment.Delivery){
            if(blank(r.deliveryName())||blank(r.deliveryPhone())||blank(r.deliveryAddress())||!r.deliveryPhone().matches("\\+?[0-9]{8,15}"))throw ApiException.invalid("Cần tên, số điện thoại và địa chỉ giao hợp lệ.");
            order.deliveryName=r.deliveryName();order.deliveryPhone=r.deliveryPhone();order.deliveryAddress=r.deliveryAddress();
            order.deliveryLatitude=r.deliveryLatitude();order.deliveryLongitude=r.deliveryLongitude();order.deliveryFee=OrderPolicy.delivery(branch,r.deliveryLatitude(),r.deliveryLongitude());
        }else if(r.deliveryName()!=null||r.deliveryPhone()!=null||r.deliveryAddress()!=null||r.deliveryLatitude()!=null||r.deliveryLongitude()!=null)throw ApiException.invalid("Chỉ Delivery nhận thông tin giao hàng.");
        var resolved=dependencies.resolve(r.branchId(),lines);
        int reward=-1;
        if(r.redeemReward()){
            reward=r.rewardItemIndex()==null?-1:r.rewardItemIndex();
            if(reward>=lines.size())throw ApiException.invalid("reward_item_index không thuộc danh sách món của đơn.");
            if(r.rewardItemIndex()==null)for(int i=0;i<resolved.size();i++)if(resolved.get(i).price().signum()>0
                    &&(reward<0||resolved.get(i).price().compareTo(resolved.get(reward).price())<0))reward=i;
            if(reward<0||resolved.get(reward).price().signum()<=0)throw ApiException.invalid("Món đổi thưởng phải có giá gốc lớn hơn 0.");
        }
        for(int i=0;i<lines.size();i++){
            var input=lines.get(i);var snapshot=resolved.get(i);var item=new OrderItem();item.order=order;
            item.variantId=snapshot.variantId();item.productId=snapshot.productId();item.productName=snapshot.productName();item.variantName=snapshot.variantName();
            item.quantity=input.quantity();item.note=input.note();item.unitPrice=snapshot.price();
            for(var selected:snapshot.options()){
                var option=new OrderOption();option.item=item;option.optionId=selected.optionId();option.optionName=selected.optionName();option.quantity=selected.quantity();option.unitPrice=selected.extraPrice();
                item.options.add(option);item.optionsUnitTotal=item.optionsUnitTotal.add(option.unitPrice.multiply(BigDecimal.valueOf(option.quantity)));
            }
            order.subTotal=order.subTotal.add(item.lineTotal());
            if(i==reward){
                OrderItem free=item;
                if(item.quantity>1){
                    item.quantity--;order.items.add(item);
                    free=rewardCopy(item);
                }
                free.quantity=1;free.isRewardItem=true;free.discountAmount=free.unitPrice;
                order.itemDiscountAmount=free.unitPrice;
                order.items.add(free);
            }else order.items.add(item);
        }
        order.finalAmount=order.subTotal.subtract(order.itemDiscountAmount).add(order.deliveryFee);
        if(benefits){
            // Allocate an Order ID and check local constraints before the first remote mutation.
            orders.saveAndFlush(order);
            recovery.begin(order.id,userId);
            Long checkoutId=order.id;
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){
                @Override public void afterCompletion(int status){
                    try{recovery.recover(checkoutId);}
                    catch(Exception ex){log.warn("Checkout recovery will retry from ledger: orderId={}",checkoutId);}
                }
            });
            if(r.redeemReward())engagement.redeem(userId,order.id);
            if(r.voucherCode()!=null){
                order.voucherCode=r.voucherCode().trim().toUpperCase(Locale.ROOT);
                order.voucherDiscountAmount=engagement.apply(order.voucherCode,userId,order.id,order.branchId,
                        order.fulfillmentType.name(),order.subTotal.subtract(order.itemDiscountAmount));
            }
            order.finalAmount=order.subTotal.subtract(order.itemDiscountAmount).subtract(order.voucherDiscountAmount).add(order.deliveryFee);
        }
        if(order.finalAmount.precision()>15)throw ApiException.invalid("Tổng tiền vượt giới hạn DECIMAL(15,0).");
        // VAT is included in final_amount, per the SQL formula; never added a second time.
        if(vatRate.signum()<0||vatRate.compareTo(BigDecimal.ONE)>0)throw new IllegalStateException("Invalid VAT rate");
        order.vatAmount=order.finalAmount.multiply(vatRate).divide(BigDecimal.ONE.add(vatRate),0,RoundingMode.HALF_UP);
        if(order.finalAmount.signum()==0)order.paymentStatus=PaymentStatus.Paid;
        else if(method==PaymentMethod.VNPay||method==PaymentMethod.Momo){order.status=Status.Pending_Payment;order.expiresAt=LocalDateTime.now(ZoneOffset.UTC).plusMinutes(paymentTimeout);}
        var history=new OrderHistory();history.order=order;history.status=order.status;history.changedBy=context.actor()==null?null:context.actor().userId();history.note="Tạo đơn";order.statusHistory.add(history);
        orders.saveAndFlush(order);
        if(cart!=null){cart.status=CartStatus.Converted;cart.touch();}
        events.emit("order.created",order,null,history.changedBy,r.note());return new Created(events.snapshot(order),false);
    }
    private OrderItem rewardCopy(OrderItem source){
        var item=new OrderItem();item.order=source.order;item.productId=source.productId;item.variantId=source.variantId;
        item.productName=source.productName;item.variantName=source.variantName;item.unitPrice=source.unitPrice;
        item.optionsUnitTotal=source.optionsUnitTotal;item.note=source.note;
        for(var original:source.options){var option=new OrderOption();option.item=item;option.optionId=original.optionId;
            option.optionName=original.optionName;option.quantity=original.quantity;option.unitPrice=original.unitPrice;item.options.add(option);}
        return item;
    }
    public Integer requireBranch(Context context,Integer requested){
        var actor=access.staff(context);
        if(actor.admin())return requested;
        var staff=dependencies.staff(actor.userId());
        if(!"Active".equals(staff.status()))throw ApiException.forbidden();
        if(requested!=null&&!requested.equals(staff.branchId()))throw ApiException.forbidden();return staff.branchId();
    }
    public CafeOrder find(Long id){return orders.findById(id).orElseThrow(ApiException::missing);}
    public Object mine(Long id,Context context){var user=access.customer(context);var order=find(id);if(!Objects.equals(user.userId(),order.userId))throw ApiException.missing();return events.snapshot(order);}
    public Object staffDetail(Long id,Context context){access.staff(context);var order=find(id);requireBranch(context,order.branchId);return events.snapshot(order);}
    public Object sessionDetail(Long id,Context context){var session=carts.qrSession(context,false);var order=find(id);if(!session.id().equals(order.tableSessionId))throw ApiException.missing();return events.snapshot(order);}
    public Object sessionOrders(Context context,Status status){var session=carts.qrSession(context,false);return orders.findByTableSessionIdOrderById(session.id()).stream().filter(o->status==null||o.status==status).map(events::summary).toList();}
    public Object history(Long id,Context context){access.require(context);var order=find(id);authorize(order,context);return events.snapshot(order).get("status_history");}
    private boolean authorize(CafeOrder order,Context context){
        var actor=access.require(context);
        if(actor.staff()){requireBranch(context,order.branchId);return false;}
        access.customer(context);if(!Objects.equals(actor.userId(),order.userId))throw ApiException.missing();return true;
    }
    public Object change(Long id,ChangeStatus request,Context context){
        access.require(context);
        var order=orders.lock(id).orElseThrow(ApiException::missing);boolean customer=authorize(order,context);
        if(!Objects.equals(order.version,request.version()))throw ApiException.conflict("VERSION_CONFLICT","Đơn đã thay đổi. Hãy tải lại version mới.");
        OrderPolicy.transition(order.status,request.status(),order.fulfillmentType,customer);
        if((request.status()==Status.Cancelled||request.status()==Status.Rejected)&&blank(request.cancelReason()))throw ApiException.invalid("cancel_reason bắt buộc khi hủy/từ chối.");
        if(request.status()==Status.Completed&&order.paymentStatus!=PaymentStatus.Paid)OrderPolicy.rule("Chỉ hoàn tất đơn có số tiền thanh toán ròng đủ final_amount.");
        transition(order,request.status(),context.actor().userId(),request.note(),request.cancelReason());orders.flush();return events.snapshot(order);
    }
    public void transition(CafeOrder order,Status target,String actor,String note,String reason){
        var from=order.status;order.status=target;order.updatedAt=LocalDateTime.now(ZoneOffset.UTC);
        if(target==Status.Cancelled||target==Status.Rejected){order.cancelReason=reason;order.cancelledBy=actor;order.cancelledAt=order.updatedAt;}
        if(target==Status.Completed)order.completedAt=order.updatedAt;
        var h=new OrderHistory();h.order=order;h.fromStatus=from.name();h.status=target;h.changedBy=actor;h.note=note;order.statusHistory.add(h);
        orders.flush();events.emit("order.status_changed",order,from.name(),actor,note);
        if(target==Status.Completed)events.emit("order.completed",order,from.name(),actor,note);
        // Rejection also releases reservations and reverses vouchers through the cancellation event.
        if(target==Status.Cancelled||target==Status.Rejected)events.emit("order.cancelled",order,from.name(),actor,note);
    }
    @Transactional(readOnly=true) public Object internal(Long id){return events.snapshot(find(id));}
    @Transactional(readOnly=true) public Object internalSession(Long id,PaymentStatus payment){return (payment==null?orders.findByTableSessionIdOrderById(id):orders.findByTableSessionIdAndPaymentStatusOrderById(id,payment)).stream().filter(o->o.status!=Status.Cancelled&&o.status!=Status.Rejected).map(events::summary).toList();}
    private static boolean blank(String value){return value==null||value.isBlank();}
    private static String hash(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception ex){throw new IllegalStateException(ex);}}
}
