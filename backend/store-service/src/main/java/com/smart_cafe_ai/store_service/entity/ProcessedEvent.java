package com.smart_cafe_ai.store_service.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Bảng Inbox – lưu ID của các event đã xử lý để đảm bảo idempotency.
 *
 * Trước khi xử lý một event từ Kafka, consumer kiểm tra xem event_id
 * đã tồn tại trong bảng này chưa. Nếu đã có → bỏ qua (đã xử lý).
 *
 * Events được tiêu thụ bởi Store Service:
 *   - payment.succeeded → đóng Table_Session, trả bàn về Empty
 */
@Entity
@Table(name = "Processed_Events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProcessedEvent {

    /**
     * event_id là PRIMARY KEY – đảm bảo mỗi event chỉ được xử lý đúng 1 lần.
     */
    @Id
    @Column(name = "event_id", length = 36)
    private String eventId;

    @Column(name = "event_type", nullable = false, length = 100)
    private String eventType;

    @Column(name = "source_service", length = 100)
    private String sourceService;

    @Column(name = "processed_at", nullable = false)
    @Builder.Default
    private LocalDateTime processedAt = LocalDateTime.now();
}
