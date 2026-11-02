package com.smart_cafe_ai.engagement_service.dto;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.Instant;
import static com.smart_cafe_ai.engagement_service.model.Types.*;
public final class Requests {
    private Requests() { }
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record Adjustment(@NotBlank @Size(max=36) String userId,@NotNull Integer stamps,@NotBlank @Size(max=255) String note) { }
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record Redeem(@NotBlank @Size(max=36) String userId,@NotNull @Positive Long orderId,@NotBlank @Size(max=64) String idempotencyKey) { }
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ReverseBenefits(@NotBlank @Size(max=36) String userId,@NotNull @Positive Long orderId) { }
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ValidateVoucher(@NotBlank @Size(max=50) String code,@NotNull @Positive Integer branchId,@NotNull Fulfillment fulfillmentType,@NotNull @DecimalMin("0") @Digits(integer=15,fraction=0) BigDecimal orderAmount) { }
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ApplyVoucher(@NotBlank @Size(max=50) String code,@NotBlank @Size(max=36) String userId,@NotNull @Positive Long orderId,@NotNull @Positive Integer branchId,@NotNull Fulfillment fulfillmentType,@NotNull @DecimalMin("0") @Digits(integer=15,fraction=0) BigDecimal orderAmount) { }
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record VoucherWrite(@Size(max=50) String code,@NotBlank @Size(max=100) String name,@NotNull DiscountType discountType,
        @NotNull @DecimalMin("1") @Digits(integer=15,fraction=0) BigDecimal discountValue,
        @DecimalMin("0") @Digits(integer=15,fraction=0) BigDecimal maxDiscountAmount,@DecimalMin("0") @Digits(integer=15,fraction=0) BigDecimal minOrderAmount,
        @Positive Integer branchId,Fulfillment applicableFulfillment,@NotNull Instant startsAt,@NotNull Instant endsAt,
        @Min(0) Integer usageLimitTotal,@Min(1) Integer usageLimitPerUser,VoucherStatus status) { }
    public record VoucherState(@NotNull VoucherStatus status) { }
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ReviewWrite(@NotNull @Positive Long orderItemId,@NotNull @Positive Integer productId,@NotNull @Min(1) @Max(5) Integer rating,@Size(max=10000) String comment) { }
    public record ReviewState(@NotNull ReviewStatus status) { }
    public record TokenWrite(@NotNull Platform platform,@NotBlank @Size(max=512) String token) { }
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ReadState(@NotNull Boolean isRead) { }
}
