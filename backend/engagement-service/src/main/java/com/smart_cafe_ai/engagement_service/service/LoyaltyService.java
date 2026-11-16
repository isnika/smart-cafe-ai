package com.smart_cafe_ai.engagement_service.service;

import com.smart_cafe_ai.engagement_service.dto.*;
import com.smart_cafe_ai.engagement_service.dto.Requests.*;
import com.smart_cafe_ai.engagement_service.exception.ApiException;
import com.smart_cafe_ai.engagement_service.model.*;
import com.smart_cafe_ai.engagement_service.model.Types.TransactionType;
import com.smart_cafe_ai.engagement_service.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;

@Service
public class LoyaltyService {
    public record CommandResult(LoyaltyTransaction transaction,LoyaltyCard loyaltyCard,boolean replay) {
        public Map<String,Object> data() { return Map.of("transaction",transaction,"loyalty_card",loyaltyCard); }
    }
    private final LoyaltyCardRepository cards;
    private final LoyaltyTransactionRepository transactions;
    private final EngagementEvents events;
    private final OrderBenefitGuard benefitGuard;
    public LoyaltyService(LoyaltyCardRepository cards,LoyaltyTransactionRepository transactions,EngagementEvents events,OrderBenefitGuard benefitGuard) {
        this.cards=cards; this.transactions=transactions; this.events=events;
        this.benefitGuard=benefitGuard;
    }
    @Transactional
    public LoyaltyCard mine(String userId) { return card(userId); }
    private LoyaltyCard card(String userId) {
        return cards.lockByUserId(userId).orElseGet(()->{
            var c=new LoyaltyCard(); c.userId=userId; return cards.saveAndFlush(c);
        });
    }
    @Transactional(readOnly=true)
    public ApiResponse history(String userId,TransactionType type,int page,int size,String sort) {
        return ApiResponse.page(transactions.findAll((root,q,cb)->{
            var p=cb.equal(root.get("userId"),userId);
            return type==null?p:cb.and(p,cb.equal(root.get("transactionType"),type));
        },Paging.of(page,size,sort,Map.of("id","id","created_at","createdAt","stamps","stamps"))));
    }
    @Transactional
    public CommandResult adjust(Adjustment request,String actor,String key) {
        if(request.stamps()==0) throw ApiException.invalid("stamps phải khác 0.");
        if(key!=null&&(key.isBlank()||key.length()>64)) throw ApiException.invalid("Idempotency-Key dài 1–64 ký tự.");
        var c=card(request.userId());
        var previous=key==null?Optional.<LoyaltyTransaction>empty():transactions.findByIdempotencyKey(key);
        if(previous.isPresent()) {
            var t=previous.get();
            if(t.transactionType!=TransactionType.Adjustment||!t.userId.equals(request.userId())||t.stamps!=request.stamps()
                    ||!Objects.equals(t.note,request.note())||!Objects.equals(t.createdBy,actor)) throw idempotencyConflict();
            return new CommandResult(t,c,true);
        }
        var t=change(c,null,TransactionType.Adjustment,request.stamps(),key,null,request.note(),actor);
        cards.flush();
        return new CommandResult(t,c,false);
    }
    @Transactional
    public CommandResult redeem(Redeem request) {
        benefitGuard.requireNotReversed(request.orderId(),request.userId());
        var c=card(request.userId());
        var previous=transactions.findByIdempotencyKey(request.idempotencyKey());
        if(previous.isPresent()) {
            var t=previous.get();
            if(t.transactionType!=TransactionType.Redeem||!t.userId.equals(request.userId())||!request.orderId().equals(t.orderId)) throw idempotencyConflict();
            if(transactions.existsByReversalOfId(t.id)) throw ApiException.conflict("Lần đổi thưởng này đã được hoàn tác.");
            return new CommandResult(t,c,true);
        }
        if(transactions.findByOrderIdAndTransactionType(request.orderId(),TransactionType.Redeem).isPresent()) throw ApiException.conflict("Đơn hàng đã đổi thưởng bằng một yêu cầu khác.");
        benefitGuard.requireActive(request.orderId(),request.userId());
        if(c.currentStamps<10) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"INSUFFICIENT_STAMPS","Bạn cần ít nhất 10 tem để đổi thưởng.");
        var t=change(c,request.orderId(),TransactionType.Redeem,-10,request.idempotencyKey(),null,null,null);
        c.totalRedeemedCups=Math.addExact(c.totalRedeemedCups,1);
        emit("engagement.loyalty.redeemed",t);
        cards.flush();
        return new CommandResult(t,c,false);
    }
    @Transactional
    public void earn(String userId,Long orderId,int stamps) {
        if(stamps==0) return;
        if(stamps<1||stamps>50) throw ApiException.business("Schema hiện tại chỉ cho phép 1–50 tem Earn cho mỗi đơn; cần xử lý chính sách đơn lớn.");
        var c=card(userId);
        var existing=transactions.findByOrderIdAndTransactionType(orderId,TransactionType.Earn);
        if(existing.isPresent()) {
            if(!existing.get().userId.equals(userId)||existing.get().stamps!=stamps) throw ApiException.conflict("Dữ liệu tích tem của đơn hàng không khớp.");
            return;
        }
        var t=change(c,orderId,TransactionType.Earn,stamps,null,null,null,null);
        c.lifetimeStampsEarned=Math.addExact(c.lifetimeStampsEarned,stamps);
        emit("engagement.loyalty.earned",t);
    }
    @Transactional
    public void reverse(Long orderId) {
        // Lock cards in a stable order before re-reading reversal state.
        var originals=transactions.findByOrderIdOrderByIdAsc(orderId).stream()
                .filter(t->t.transactionType==TransactionType.Earn||t.transactionType==TransactionType.Redeem).toList();
        var locked=new HashMap<String,LoyaltyCard>();
        originals.stream().map(t->t.userId).distinct().sorted().forEach(u->locked.put(u,card(u)));
        for(var t:originals) {
            if(transactions.existsByReversalOfId(t.id)) continue;
            var reversal=change(locked.get(t.userId),orderId,TransactionType.Reversal,-t.stamps,null,t.id,"Hoàn tác đơn hàng",null);
            emit("engagement.loyalty.reversed",reversal);
        }
    }
    private LoyaltyTransaction change(LoyaltyCard c,Long order,TransactionType type,int stamps,String key,Long reversal,String note,String actor) {
        long next=(long)c.currentStamps+stamps;
        if(next< -100||next>Integer.MAX_VALUE) throw ApiException.business("Số dư tem vượt giới hạn cho phép.");
        c.currentStamps=(int)next; c.updatedAt=Instant.now();
        var t=new LoyaltyTransaction(); t.userId=c.userId; t.orderId=order; t.transactionType=type;
        t.stamps=stamps; t.balanceAfter=c.currentStamps; t.idempotencyKey=key; t.reversalOfId=reversal; t.note=note; t.createdBy=actor;
        return transactions.saveAndFlush(t);
    }
    private void emit(String type,LoyaltyTransaction t) {
        var data=new LinkedHashMap<String,Object>(); data.put("user_id",t.userId); data.put("order_id",t.orderId);
        data.put("stamps",t.stamps); data.put("balance_after",t.balanceAfter);
        if(t.reversalOfId!=null) data.put("reversal_of_id",t.reversalOfId);
        events.emit(type,"LoyaltyCard",t.userId,data);
    }
    private ApiException idempotencyConflict() { return new ApiException(HttpStatus.CONFLICT,"IDEMPOTENCY_CONFLICT","Idempotency-Key đã được dùng với dữ liệu khác."); }
}
