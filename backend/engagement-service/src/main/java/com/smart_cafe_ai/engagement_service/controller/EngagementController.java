package com.smart_cafe_ai.engagement_service.controller;

import com.smart_cafe_ai.engagement_service.dto.*;
import com.smart_cafe_ai.engagement_service.dto.Requests.*;
import com.smart_cafe_ai.engagement_service.exception.ApiException;
import com.smart_cafe_ai.engagement_service.security.Access;
import com.smart_cafe_ai.engagement_service.service.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;
import static com.smart_cafe_ai.engagement_service.model.Types.*;

@RestController
@RequestMapping("/api/v1")
public class EngagementController {
    private final Access access;
    private final LoyaltyService loyalty;
    private final VoucherService vouchers;
    private final ReviewService reviews;
    private final CustomerNotificationService notifications;
    private final OrderBenefitService benefits;
    public EngagementController(Access access,LoyaltyService loyalty,VoucherService vouchers,ReviewService reviews,CustomerNotificationService notifications,OrderBenefitService benefits) {
        this.access=access; this.loyalty=loyalty; this.vouchers=vouchers; this.reviews=reviews; this.notifications=notifications;
        this.benefits=benefits;
    }
    @PostMapping("/internal/benefits/reverse")
    public ApiResponse reverseBenefits(@Valid @RequestBody ReverseBenefits body,HttpServletRequest req) {
        access.internal(req);benefits.reverse(body.orderId(),body.userId());
        return ApiResponse.ok(java.util.Map.of("order_id",body.orderId(),"status","Reversed"));
    }
    @GetMapping("/loyalty/me")
    public ApiResponse card(HttpServletRequest req) { return ApiResponse.ok(loyalty.mine(access.customer(req).userId())); }
    @GetMapping("/loyalty/me/transactions")
    public ApiResponse transactions(@RequestParam(name="transaction_type",required=false) TransactionType type,@RequestParam(defaultValue="1") int page,
            @RequestParam(defaultValue="20") int size,@RequestParam(defaultValue="created_at,desc") String sort,HttpServletRequest req) {
        return loyalty.history(access.customer(req).userId(),type,page,size,sort);
    }
    @PostMapping("/loyalty/adjustments")
    public ResponseEntity<ApiResponse> adjust(@Valid @RequestBody Adjustment body,@RequestHeader(name="Idempotency-Key",required=false) String key,HttpServletRequest req) {
        var result=loyalty.adjust(body,access.manager(req).userId(),key); return ResponseEntity.status(result.replay()?200:201).body(ApiResponse.ok(result.data()));
    }
    @PostMapping("/internal/loyalty/redeem")
    public ResponseEntity<ApiResponse> redeem(@Valid @RequestBody Redeem body,HttpServletRequest req) {
        access.internal(req); var result=loyalty.redeem(body); return ResponseEntity.status(result.replay()?200:201).body(ApiResponse.ok(result.data()));
    }
    @GetMapping("/vouchers/available")
    public ApiResponse available(@RequestParam(name="branch_id",required=false) Integer branch,@RequestParam(name="fulfillment_type",required=false) Fulfillment fulfillment,
            @RequestParam(name="order_amount",required=false) BigDecimal amount,HttpServletRequest req) {
        return ApiResponse.ok(vouchers.available(access.customer(req).userId(),branch,fulfillment,amount));
    }
    @PostMapping("/vouchers/validate")
    public ApiResponse validate(@Valid @RequestBody ValidateVoucher body,HttpServletRequest req) { return ApiResponse.ok(vouchers.validate(access.customer(req).userId(),body)); }
    @PostMapping("/internal/vouchers/apply")
    public ResponseEntity<ApiResponse> apply(@Valid @RequestBody ApplyVoucher body,HttpServletRequest req) {
        access.internal(req); var result=vouchers.apply(body); return ResponseEntity.status(result.replay()?200:201).body(ApiResponse.ok(result.data()));
    }
    @GetMapping("/vouchers")
    public ApiResponse vouchers(@RequestParam(required=false) VoucherStatus status,@RequestParam(name="branch_id",required=false) Integer branch,
            @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,HttpServletRequest req) { return vouchers.list(status,branch,page,size,access.manager(req)); }
    @PostMapping("/vouchers")
    public ResponseEntity<ApiResponse> createVoucher(@Valid @RequestBody VoucherWrite body,HttpServletRequest req) { return ResponseEntity.status(201).body(ApiResponse.ok(vouchers.create(body,access.manager(req)))); }
    @PutMapping("/vouchers/{id}")
    public ApiResponse updateVoucher(@PathVariable @Positive Long id,@Valid @RequestBody VoucherWrite body,HttpServletRequest req) { return ApiResponse.ok(vouchers.update(id,body,access.manager(req))); }
    @PatchMapping("/vouchers/{id}/status")
    public ApiResponse voucherStatus(@PathVariable @Positive Long id,@Valid @RequestBody VoucherState body,HttpServletRequest req) { return ApiResponse.ok(vouchers.state(id,body.status(),access.manager(req))); }
    @PostMapping("/reviews")
    public ResponseEntity<ApiResponse> createReview(@Valid @RequestBody ReviewWrite body,HttpServletRequest req) { return ResponseEntity.status(201).body(ApiResponse.ok(reviews.create(access.customer(req).userId(),body))); }
    @GetMapping("/reviews")
    public ApiResponse publicReviews(@RequestParam(name="product_id") @Positive Integer product,@RequestParam(defaultValue="1") int page,
            @RequestParam(defaultValue="20") int size,@RequestParam(defaultValue="created_at,desc") String sort) { return reviews.list(product,null,ReviewStatus.Approved,page,size,sort,null); }
    @GetMapping("/reviews/me")
    public ApiResponse myReviews(@RequestParam(required=false) ReviewStatus status,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,HttpServletRequest req) {
        return reviews.list(null,access.customer(req).userId(),status,page,size,"created_at,desc",null);
    }
    @GetMapping("/reviews/admin")
    public ApiResponse adminReviews(@RequestParam(required=false) ReviewStatus status,@RequestParam(name="product_id",required=false) @Positive Integer product,
            @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,HttpServletRequest req) { return reviews.list(product,null,status,page,size,"created_at,desc",access.manager(req)); }
    @PatchMapping("/reviews/{id}/status")
    public ApiResponse reviewStatus(@PathVariable @Positive Long id,@Valid @RequestBody ReviewState body,HttpServletRequest req) { return ApiResponse.ok(reviews.moderate(id,body.status(),access.manager(req))); }
    @PostMapping("/device-tokens")
    public ResponseEntity<ApiResponse> device(@Valid @RequestBody TokenWrite body,HttpServletRequest req) { return ResponseEntity.status(201).body(ApiResponse.ok(notifications.register(access.customer(req).userId(),body))); }
    @DeleteMapping("/device-tokens/{id}")
    public ResponseEntity<Void> disable(@PathVariable @Positive Long id,HttpServletRequest req) { notifications.disable(access.customer(req).userId(),id); return ResponseEntity.noContent().build(); }
    @GetMapping("/notifications/me")
    public ApiResponse notifications(@RequestParam(name="is_read",required=false) Boolean read,@RequestParam(required=false) String type,
            @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(defaultValue="created_at,desc") String sort,HttpServletRequest req) {
        return notifications.list(access.customer(req).userId(),read,type,page,size,sort);
    }
    @PatchMapping("/notifications/{id}/read")
    public ApiResponse read(@PathVariable @Positive Long id,@Valid @RequestBody ReadState body,HttpServletRequest req) { return ApiResponse.ok(notifications.read(access.customer(req).userId(),id,body.isRead())); }
    @PostMapping("/notifications/read-all")
    public ApiResponse readAll(HttpServletRequest req) { return ApiResponse.ok(notifications.readAll(access.customer(req).userId())); }
}
