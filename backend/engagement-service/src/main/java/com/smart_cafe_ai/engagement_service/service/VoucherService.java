package com.smart_cafe_ai.engagement_service.service;

import com.smart_cafe_ai.engagement_service.dto.*;
import com.smart_cafe_ai.engagement_service.dto.Requests.*;
import com.smart_cafe_ai.engagement_service.exception.ApiException;
import com.smart_cafe_ai.engagement_service.model.*;
import com.smart_cafe_ai.engagement_service.repository.*;
import com.smart_cafe_ai.engagement_service.security.Access.Actor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Instant;
import java.util.*;
import static com.smart_cafe_ai.engagement_service.model.Types.*;

@Service
public class VoucherService {
    @jakarta.persistence.PersistenceContext
    private jakarta.persistence.EntityManager entityManager;
    public record Applied(VoucherRedemption redemption,boolean replay) {
        public Map<String,Object> data() { return Map.of("voucher_id",redemption.voucherId,"order_id",redemption.orderId,"discount_amount",redemption.discountAmount,"status",redemption.status); }
    }
    private final VoucherRepository vouchers;
    private final VoucherRedemptionRepository redemptions;
    public VoucherService(VoucherRepository vouchers,VoucherRedemptionRepository redemptions) { this.vouchers=vouchers; this.redemptions=redemptions; }
    @Transactional(readOnly=true)
    public ApiResponse list(VoucherStatus status,Integer branch,int page,int size,Actor actor) {
        Integer scope=managerBranch(actor,branch,false);
        return ApiResponse.page(vouchers.findAll((r,q,cb)->{
            var p=cb.conjunction();
            if(status!=null) p=cb.and(p,cb.equal(r.get("status"),status));
            if(scope!=null) p=cb.and(p,cb.equal(r.get("branchId"),scope));
            return p;
        },Paging.of(page,size,"id,desc",Map.of("id","id"))));
    }
    @Transactional(readOnly=true)
    public List<Voucher> available(String user,Integer branch,Fulfillment fulfillment,BigDecimal amount) {
        checkContext(branch,fulfillment,amount,false);
        var now=Instant.now();
        return vouchers.findAll((r,q,cb)->cb.and(cb.equal(r.get("status"),VoucherStatus.Active),cb.lessThanOrEqualTo(r.get("startsAt"),now),cb.greaterThan(r.get("endsAt"),now)))
                .stream().filter(v->reason(v,user,branch,fulfillment,amount)==null).toList();
    }
    @Transactional(readOnly=true)
    public Map<String,Object> validate(String user,ValidateVoucher request) {
        checkContext(request.branchId(),request.fulfillmentType(),request.orderAmount(),true);
        var v=vouchers.findByCodeIgnoreCase(request.code().trim()).orElse(null);
        String reason=v==null?"VOUCHER_NOT_FOUND":reason(v,user,request.branchId(),request.fulfillmentType(),request.orderAmount());
        var data=new LinkedHashMap<String,Object>(); data.put("valid",reason==null); data.put("discount_amount",reason==null?discount(v,request.orderAmount()):BigDecimal.ZERO);
        data.put("reason",reason); data.put("voucher",v==null?null:Map.of("id",v.id,"code",v.code,"name",v.name));
        return data;
    }
    @Transactional
    public Applied apply(ApplyVoucher request) {
        checkContext(request.branchId(),request.fulfillmentType(),request.orderAmount(),true);
        var v=vouchers.lockByCode(request.code().trim()).orElseThrow(()->ApiException.business("Voucher không tồn tại."));
        String hash=hash(request);
        var old=redemptions.findByVoucherIdAndOrderId(v.id,request.orderId());
        if(old.isPresent()) {
            var r=old.get();
            if(!r.userId.equals(request.userId())||!Objects.equals(r.requestHash,hash)) throw new ApiException(HttpStatus.CONFLICT,"IDEMPOTENCY_CONFLICT","Đơn hàng đã áp dụng voucher với dữ liệu khác.");
            if(r.status==RedemptionStatus.Reversed) throw ApiException.conflict("Voucher của đơn hàng đã được hoàn tác.");
            return new Applied(r,true);
        }
        String reason=reason(v,request.userId(),request.branchId(),request.fulfillmentType(),request.orderAmount());
        if(reason!=null) throw ApiException.business(reason);
        var r=new VoucherRedemption(); r.voucherId=v.id; r.userId=request.userId(); r.orderId=request.orderId(); r.discountAmount=discount(v,request.orderAmount()); r.requestHash=hash;
        v.usedCount=Math.addExact(v.usedCount,1);
        redemptions.saveAndFlush(r);
        return new Applied(r,false);
    }
    @Transactional
    public Voucher create(VoucherWrite request,Actor actor) {
        if(request.code()==null||request.code().isBlank()) throw ApiException.invalid("code là bắt buộc.");
        String code=request.code().trim().toUpperCase(Locale.ROOT);
        if(vouchers.existsByCodeIgnoreCase(code)) throw ApiException.conflict("Mã voucher đã tồn tại.");
        var v=new Voucher(); v.code=code; fill(v,request,actor); return vouchers.saveAndFlush(v);
    }
    @Transactional
    public Voucher update(Long id,VoucherWrite request,Actor actor) {
        var v=vouchers.lockById(id).orElseThrow(ApiException::missing); enforceScope(actor,v.branchId);
        if(request.code()!=null&&!request.code().equalsIgnoreCase(v.code)) throw ApiException.invalid("Bạn không thể thay đổi mã voucher sau khi tạo.");
        fill(v,request,actor); vouchers.flush(); return v;
    }
    @Transactional
    public Map<String,Object> state(Long id,VoucherStatus state,Actor actor) {
        var v=vouchers.lockById(id).orElseThrow(ApiException::missing); enforceScope(actor,v.branchId); v.status=state;
        return Map.of("id",v.id,"status",v.status);
    }
    private void fill(Voucher v,VoucherWrite r,Actor actor) {
        if(!r.endsAt().isAfter(r.startsAt())) throw ApiException.invalid("ends_at phải sau starts_at.");
        if(r.discountType()==DiscountType.Percent&&r.discountValue().compareTo(BigDecimal.valueOf(100))>0) throw ApiException.invalid("Phần trăm giảm giá phải trong khoảng 1–100.");
        if(r.usageLimitTotal()!=null&&r.usageLimitTotal()<v.usedCount) throw ApiException.conflict("Giới hạn tổng không được thấp hơn số lượt đã dùng.");
        managerBranch(actor,r.branchId(),true);
        v.name=r.name(); v.discountType=r.discountType(); v.discountValue=r.discountValue(); v.maxDiscountAmount=r.maxDiscountAmount();
        v.minOrderAmount=r.minOrderAmount()==null?BigDecimal.ZERO:r.minOrderAmount(); v.branchId=r.branchId();
        v.applicableFulfillment=r.applicableFulfillment()==null?Fulfillment.All:r.applicableFulfillment(); v.startsAt=r.startsAt(); v.endsAt=r.endsAt();
        v.usageLimitTotal=r.usageLimitTotal(); v.usageLimitPerUser=r.usageLimitPerUser()==null?1:r.usageLimitPerUser(); v.status=r.status()==null?VoucherStatus.Active:r.status();
    }
    @Transactional
    public void reverse(Long orderId) {
        for(var r:redemptions.findByOrderIdOrderByVoucherIdAsc(orderId)) {
            var v=vouchers.lockById(r.voucherId).orElseThrow(ApiException::missing);
            // Refresh after locking so a concurrent cancellation/refund cannot decrement twice.
            entityManager.refresh(r,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
            var current=r;
            if(current.status==RedemptionStatus.Reversed) continue;
            current.status=RedemptionStatus.Reversed;
            if(v.usedCount<=0) throw ApiException.conflict("Số lượt voucher không nhất quán.");
            v.usedCount--;
        }
    }
    private String reason(Voucher v,String user,Integer branch,Fulfillment fulfillment,BigDecimal amount) {
        Instant now=Instant.now();
        if(v.status!=VoucherStatus.Active) return "VOUCHER_INACTIVE";
        if(now.isBefore(v.startsAt)||!now.isBefore(v.endsAt)) return "VOUCHER_OUTSIDE_PERIOD";
        if(branch!=null&&v.branchId!=null&&!branch.equals(v.branchId)) return "VOUCHER_BRANCH_MISMATCH";
        if(fulfillment!=null&&v.applicableFulfillment!=Fulfillment.All&&v.applicableFulfillment!=fulfillment) return "VOUCHER_FULFILLMENT_MISMATCH";
        if(amount!=null&&amount.compareTo(v.minOrderAmount)<0) return "VOUCHER_MIN_ORDER_AMOUNT";
        if(v.usageLimitTotal!=null&&v.usedCount>=v.usageLimitTotal) return "VOUCHER_TOTAL_LIMIT";
        if(redemptions.countByVoucherIdAndUserIdAndStatus(v.id,user,RedemptionStatus.Applied)>=v.usageLimitPerUser) return "VOUCHER_USER_LIMIT";
        if(amount!=null&&discount(v,amount).signum()<=0) return "VOUCHER_ZERO_DISCOUNT";
        return null;
    }
    private BigDecimal discount(Voucher v,BigDecimal amount) {
        BigDecimal value=v.discountType==DiscountType.Percent?amount.multiply(v.discountValue).divide(BigDecimal.valueOf(100),0,RoundingMode.DOWN):v.discountValue;
        if(v.discountType==DiscountType.Percent&&v.maxDiscountAmount!=null) value=value.min(v.maxDiscountAmount);
        return value.min(amount).setScale(0,RoundingMode.DOWN);
    }
    private void checkContext(Integer branch,Fulfillment fulfillment,BigDecimal amount,boolean required) {
        if((required&&(branch==null||fulfillment==null||amount==null))||(branch!=null&&branch<=0)||fulfillment==Fulfillment.All
                ||(amount!=null&&(amount.signum()<0||amount.stripTrailingZeros().scale()>0||amount.precision()-amount.scale()>15))) throw ApiException.invalid("Thông tin chi nhánh, hình thức nhận hoặc số tiền không hợp lệ.");
    }
    private Integer managerBranch(Actor actor,Integer branch,boolean write) {
        if("Admin".equals(actor.role())) return branch;
        if(actor.branchId()==null) throw ApiException.forbidden();
        if((write&&branch==null)||(branch!=null&&!actor.branchId().equals(branch))) throw ApiException.forbidden();
        return actor.branchId();
    }
    private void enforceScope(Actor actor,Integer branch) { managerBranch(actor,branch,true); }
    private String hash(ApplyVoucher r) {
        try {
            String text=r.userId()+"|"+r.orderId()+"|"+r.branchId()+"|"+r.fulfillmentType()+"|"+r.orderAmount().setScale(0).toPlainString();
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch(NoSuchAlgorithmException ex) { throw new IllegalStateException(ex); }
    }
}
