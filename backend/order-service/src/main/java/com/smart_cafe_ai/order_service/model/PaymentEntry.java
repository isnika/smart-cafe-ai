package com.smart_cafe_ai.order_service.model;
import jakarta.persistence.*;
import java.math.BigDecimal;
/** Local allocation ledger, not Payment's source of truth. Key also deduplicates reissued event IDs. */
@Entity @Table(name="Order_Payment_Entries")
public class PaymentEntry {
    @Id @Column(name="entry_key",length=120) public String entryKey;
    @Column(name="order_id",nullable=false) public Long orderId;
    @Column(name="entry_type",nullable=false,length=10) public String entryType;
    @Column(nullable=false,precision=15,scale=0) public BigDecimal amount;
}
