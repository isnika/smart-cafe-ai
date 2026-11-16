package com.smart_cafe_ai.store_service.entity;

import com.smart_cafe_ai.store_service.enums.TableSessionStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Thực thể phiên bàn (Table Session) – trung tâm của luồng QR Ordering.
 *
 * STATE MACHINE (BR-STO-02, BR-STO-03):
 *   Active ──► Payment_Pending ──► Completed
 *   Active ──► Cancelled
 *   Payment_Pending ──► Active (gọi thêm món / hủy yêu cầu TT)
 *
 * open_table_id: STORED generated column trong DB giúp ràng buộc
 * "chỉ một phiên Active/Payment_Pending mỗi bàn".  Không ánh xạ
 * vào JPA vì đây là column virtual – constraint được đảm bảo ở DB.
 *
 * customer_id: External reference tới smart_cafe_identity_db.Users.id.
 * NULL cho khách vãng lai (guest) chưa đăng nhập.
 */
@Entity
@Table(name = "Table_Sessions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TableSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "table_id", nullable = false, foreignKey = @ForeignKey(name = "fk_table_sessions_table"))
    private CafeTable table;

    /**
     * Token phiên bàn ngẫu nhiên 128-bit – gửi kèm Header X-Table-Session-Code
     * để xác thực khách vãng lai tại bàn (DECISION-STO-01).
     */
    @Column(name = "session_code", nullable = false, unique = true, length = 50)
    private String sessionCode;

    /**
     * External reference tới Identity Users.id (soft reference – không có FK chéo DB).
     * NULL nếu là guest chưa đăng nhập.
     */
    @Column(name = "customer_id", length = 36)
    private String customerId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    @Builder.Default
    private TableSessionStatus status = TableSessionStatus.Active;

    @Column(name = "opened_at", nullable = false)
    @Builder.Default
    private LocalDateTime openedAt = LocalDateTime.now();

    /**
     * Thời điểm hết hạn để vô hiệu phiên QR cũ bị bỏ quên (idle expiry).
     */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;
}
