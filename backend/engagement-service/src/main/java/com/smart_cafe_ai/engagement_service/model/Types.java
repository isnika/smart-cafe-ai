package com.smart_cafe_ai.engagement_service.model;

public final class Types {
    private Types() { }
    public enum TransactionType { Earn, Redeem, Reversal, Adjustment }
    public enum DiscountType { Percent, Fixed }
    public enum Fulfillment { All, Delivery, Pickup, Dine_In }
    public enum VoucherStatus { Active, Inactive }
    public enum RedemptionStatus { Applied, Reversed }
    public enum ReviewStatus { Pending, Approved, Hidden }
    public enum Platform { iOS, Android, Web }
}
