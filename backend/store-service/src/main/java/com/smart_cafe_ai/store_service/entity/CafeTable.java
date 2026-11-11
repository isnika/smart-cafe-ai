package com.smart_cafe_ai.store_service.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * Thực thể bàn ăn trong chi nhánh.
 * Mỗi bàn có một mã QR token duy nhất dùng để khởi tạo phiên gọi món.
 *
 * Trạng thái bàn (Empty/Occupied) được SUY LUẬN từ Table_Sessions,
 * không lưu trực tiếp trên bảng này (xem view v_table_status trong DB).
 */
@Entity
@Table(
    name = "Tables",
    uniqueConstraints = {
        @UniqueConstraint(name = "uq_table_number_per_branch", columnNames = {"branch_id", "table_number"})
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CafeTable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    /**
     * Tham chiếu nội bộ tới Branch – no cross-DB FK nên dùng lazy ManyToOne.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "branch_id", nullable = false, foreignKey = @ForeignKey(name = "fk_tables_branch"))
    private Branch branch;

    @Column(name = "table_number", nullable = false, length = 20)
    private String tableNumber;

    /**
     * Mã QR token ngẫu nhiên không thể đoán trước (BR-STO-01).
     * Khi regenerate, giá trị cũ bị vô hiệu ngay lập tức.
     */
    @Column(name = "qr_code", unique = true, length = 255)
    private String qrCode;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private Boolean isActive = true;
}
