package com.smart_cafe_ai.order_service.model;

public final class Types {
    private Types() {}
    public enum Source { Online, QR, POS }
    public enum Fulfillment { Delivery, Pickup, Dine_In }
    public enum Status { Pending_Payment, Pending, Confirmed, Preparing, Ready, Shipping, Served, Completed, Cancelled, Rejected }
    public enum PaymentStatus { Unpaid, Paid, Partially_Refunded, Refunded }
    public enum CartStatus { Active, Converted, Abandoned }
}
