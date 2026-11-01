package com.smart_cafe_ai.order_service.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.List;
import static com.smart_cafe_ai.order_service.model.Types.*;

public final class Requests {
    private Requests() {}
    public record Option(@NotNull @Positive Integer optionId, @Min(1) @Max(100) Integer quantity) {
        public Option { quantity=quantity==null?1:quantity; }
    }
    public record Item(@NotNull @Positive Integer variantId, @Min(1) @Max(100) int quantity,
                       @Size(max=255) String note, @Size(max=50) List<@NotNull @Valid Option> options) {
        public Item { options=options==null?List.of():options; }
    }
    public record ItemUpdate(@Min(1) @Max(100) int quantity,@Size(max=255) String note,
                             @Size(max=50) List<@NotNull @Valid Option> options) {
        public ItemUpdate { options=options==null?List.of():options; }
    }
    public record CartCreate(@NotNull Source cartSource,@NotNull @Positive Integer branchId,@NotNull Fulfillment fulfillmentType) {}
    public record CreateOrder(@Positive Long cartId,@NotNull Source orderSource,@NotNull Fulfillment fulfillmentType,
            @NotNull @Positive Integer branchId,@Size(max=36) String userId,@Positive Long tableSessionId,
            @Size(max=100) String deliveryName,@Size(max=20) String deliveryPhone,@Size(max=255) String deliveryAddress,
            @DecimalMin("-90") @DecimalMax("90") @Digits(integer=3,fraction=7) BigDecimal deliveryLatitude,
            @DecimalMin("-180") @DecimalMax("180") @Digits(integer=3,fraction=7) BigDecimal deliveryLongitude,
            @Size(max=50) String voucherCode,Boolean redeemReward,@Size(max=255) String note,
            @Size(max=100) List<@NotNull @Valid Item> items, PaymentMethod paymentMethod) {
        public CreateOrder { items=items==null?List.of():items;redeemReward=Boolean.TRUE.equals(redeemReward); }
    }
    public enum PaymentMethod { Cash, COD, VNPay, Momo }
    public record ChangeStatus(@NotNull Status status,@Size(max=255) String note,@Size(max=255) String cancelReason,
                               @NotNull @Min(0) Integer version) {}
}
