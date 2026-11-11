package com.smart_cafe_ai.order_service.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static com.smart_cafe_ai.order_service.model.Types.*;

@Entity @Table(name="Orders")
public class CafeOrder {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @Column(name="order_code",nullable=false,unique=true,length=20) public String orderCode;
    @Column(name="idempotency_key",unique=true,length=64) @JsonIgnore public String idempotencyKey;
    @Column(name="request_hash",length=64) @JsonIgnore public String requestHash;
    @Column(name="request_owner",length=150) @JsonIgnore public String requestOwner;
    @Column(name="user_id",length=36) public String userId;
    @Column(name="created_by",length=36) public String createdBy;
    @Column(name="branch_id",nullable=false) public Integer branchId;
    @Column(name="table_session_id") public Long tableSessionId;
    @Enumerated(EnumType.STRING) @Column(name="order_source",nullable=false,length=10) public Source orderSource;
    @Enumerated(EnumType.STRING) @Column(name="fulfillment_type",nullable=false,length=10) public Fulfillment fulfillmentType;
    @Column(name="delivery_name",length=100) public String deliveryName;
    @Column(name="delivery_phone",length=20) public String deliveryPhone;
    @Column(name="delivery_address",length=255) public String deliveryAddress;
    @Column(name="delivery_latitude",precision=10,scale=7) public BigDecimal deliveryLatitude;
    @Column(name="delivery_longitude",precision=10,scale=7) public BigDecimal deliveryLongitude;
    @Column(name="sub_total",nullable=false,precision=15,scale=0) public BigDecimal subTotal=BigDecimal.ZERO;
    @Column(name="item_discount_amount",nullable=false,precision=15,scale=0) public BigDecimal itemDiscountAmount=BigDecimal.ZERO;
    @Column(name="voucher_code",length=50) public String voucherCode;
    @Column(name="voucher_discount_amount",nullable=false,precision=15,scale=0) public BigDecimal voucherDiscountAmount=BigDecimal.ZERO;
    @Column(name="delivery_fee",nullable=false,precision=15,scale=0) public BigDecimal deliveryFee=BigDecimal.ZERO;
    @Column(name="vat_amount",nullable=false,precision=15,scale=0) public BigDecimal vatAmount=BigDecimal.ZERO;
    @Column(name="final_amount",nullable=false,precision=15,scale=0) public BigDecimal finalAmount=BigDecimal.ZERO;
    @Enumerated(EnumType.STRING) @Column(nullable=false,length=20) public Status status=Status.Pending;
    @Enumerated(EnumType.STRING) @Column(name="payment_status",nullable=false,length=20) public PaymentStatus paymentStatus=PaymentStatus.Unpaid;
    @Column(name="expires_at") public LocalDateTime expiresAt;
    @Column(name="cancel_reason",length=255) public String cancelReason;
    @Column(name="cancelled_by",length=36) public String cancelledBy;
    @Column(name="cancelled_at") public LocalDateTime cancelledAt;
    @Column(name="completed_at") public LocalDateTime completedAt;
    @Column(length=255) public String note;
    @Version @Column(nullable=false) public Integer version;
    @Column(name="created_at",nullable=false) public LocalDateTime createdAt;
    @Column(name="updated_at",nullable=false) public LocalDateTime updatedAt;
    @OneToMany(mappedBy="order",cascade=CascadeType.ALL) @OrderBy("id") public List<OrderItem> items=new ArrayList<>();
    @OneToMany(mappedBy="order",cascade=CascadeType.ALL) @OrderBy("id") public List<OrderHistory> statusHistory=new ArrayList<>();
    @PrePersist void create(){createdAt=updatedAt=LocalDateTime.now(ZoneOffset.UTC);}
    @PreUpdate void update(){updatedAt=LocalDateTime.now(ZoneOffset.UTC);}
}
