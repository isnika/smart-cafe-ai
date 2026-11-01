package com.smart_cafe_ai.order_service.model;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.*;
import static com.smart_cafe_ai.order_service.model.Types.*;
@Entity @Table(name="Order_Status_History")
public class OrderHistory {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="order_id") @JsonIgnore public CafeOrder order;
    @Column(name="from_status",length=20) public String fromStatus;
    @Enumerated(EnumType.STRING) @Column(nullable=false,length=20) public Status status;
    @Column(name="changed_by",length=36) public String changedBy;
    @Column(length=255) public String note;
    @Column(name="created_at",nullable=false) public LocalDateTime createdAt=LocalDateTime.now(ZoneOffset.UTC);
    @com.fasterxml.jackson.annotation.JsonProperty("order_id") public Long orderId(){return order.id;}
}
