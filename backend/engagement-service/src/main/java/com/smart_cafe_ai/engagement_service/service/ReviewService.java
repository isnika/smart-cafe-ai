package com.smart_cafe_ai.engagement_service.service;

import com.smart_cafe_ai.engagement_service.dto.*;
import com.smart_cafe_ai.engagement_service.dto.Requests.*;
import com.smart_cafe_ai.engagement_service.exception.ApiException;
import com.smart_cafe_ai.engagement_service.model.*;
import com.smart_cafe_ai.engagement_service.repository.*;
import com.smart_cafe_ai.engagement_service.security.Access.Actor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import static com.smart_cafe_ai.engagement_service.model.Types.*;

@Service
public class ReviewService {
    private final ProductReviewRepository reviews;
    private final VerifiedPurchaseRepository purchases;
    private final EngagementEvents events;
    public ReviewService(ProductReviewRepository reviews,VerifiedPurchaseRepository purchases,EngagementEvents events) {
        this.reviews=reviews; this.purchases=purchases; this.events=events;
    }
    @Transactional
    public ProductReview create(String user,ReviewWrite r) {
        if(!purchases.existsByOrderItemIdAndUserIdAndProductId(r.orderItemId(),user,r.productId())) throw ApiException.forbidden();
        if(reviews.existsByOrderItemIdAndUserId(r.orderItemId(),user)) throw ApiException.conflict("Bạn đã đánh giá món trong đơn hàng này.");
        var review=new ProductReview(); review.userId=user; review.orderItemId=r.orderItemId(); review.productId=r.productId(); review.rating=r.rating(); review.comment=r.comment();
        return reviews.saveAndFlush(review);
    }
    @Transactional(readOnly=true)
    public ApiResponse list(Integer product,String user,ReviewStatus status,int page,int size,String sort,Actor moderator) {
        if(moderator!=null&&"Manager".equals(moderator.role())&&moderator.branchId()==null) throw ApiException.forbidden();
        return ApiResponse.page(reviews.findAll((r,q,cb)->{
            var p=cb.conjunction();
            if(product!=null) p=cb.and(p,cb.equal(r.get("productId"),product));
            if(user!=null) p=cb.and(p,cb.equal(r.get("userId"),user));
            if(status!=null) p=cb.and(p,cb.equal(r.get("status"),status));
            if(moderator!=null&&"Manager".equals(moderator.role())) {
                var sub=q.subquery(Long.class); var vp=sub.from(VerifiedPurchase.class);
                sub.select(vp.get("orderItemId")).where(cb.equal(vp.get("branchId"),moderator.branchId()));
                p=cb.and(p,r.get("orderItemId").in(sub));
            }
            return p;
        },Paging.of(page,size,sort,Map.of("id","id","created_at","createdAt","rating","rating"))));
    }
    @Transactional
    public ProductReview moderate(Long id,ReviewStatus status,Actor actor) {
        if(status==ReviewStatus.Pending) throw ApiException.invalid("Chỉ chấp nhận Approved hoặc Hidden.");
        var review=reviews.lockById(id).orElseThrow(ApiException::missing);
        if("Manager".equals(actor.role())) {
            var purchase=purchases.findById(review.orderItemId).orElseThrow(ApiException::missing);
            if(actor.branchId()==null||!actor.branchId().equals(purchase.branchId)) throw ApiException.forbidden();
        }
        if(review.status==status) return review;
        if(review.status==ReviewStatus.Hidden) throw ApiException.conflict("Đánh giá đã ẩn không được duyệt lại theo quy tắc hiện tại.");
        review.status=status; review.moderatedBy=actor.userId(); review.moderatedAt=Instant.now();
        if(status==ReviewStatus.Approved) events.emit("engagement.review.created","ProductReview",review.id,
                Map.of("review_id",review.id,"product_id",review.productId,"user_id",review.userId,"rating",review.rating,"status",review.status.name()));
        return review;
    }
}
