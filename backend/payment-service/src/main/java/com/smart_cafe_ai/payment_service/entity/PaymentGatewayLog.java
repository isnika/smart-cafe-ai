package com.smart_cafe_ai.payment_service.entity;

import com.smart_cafe_ai.payment_service.enums.GatewayDirection;
import com.smart_cafe_ai.payment_service.enums.GatewayProvider;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "Payment_Gateway_Logs",
        uniqueConstraints = @UniqueConstraint(name = "uq_gateway_event", columnNames = {"provider", "direction", "event_key"}),
        indexes = @Index(name = "idx_gateway_logs_payment", columnList = "payment_id")
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentGatewayLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "payment_id")
    private Long paymentId;

    @Enumerated(EnumType.STRING)
    @Column(name = "provider", nullable = false, length = 20)
    private GatewayProvider provider;

    @Enumerated(EnumType.STRING)
    @Column(name = "direction", nullable = false, length = 20)
    private GatewayDirection direction;

    @Column(name = "event_key", nullable = false, length = 100)
    private String eventKey;

    @Column(name = "signature_valid")
    private Boolean signatureValid;

    @Column(name = "http_status")
    private Integer httpStatus;

    @Column(name = "raw_payload", nullable = false, columnDefinition = "TEXT")
    private String rawPayload;

    @Column(name = "processed_at")
    private LocalDateTime processedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
