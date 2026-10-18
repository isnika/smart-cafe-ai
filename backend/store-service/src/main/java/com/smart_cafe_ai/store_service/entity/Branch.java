package com.smart_cafe_ai.store_service.entity;

import com.smart_cafe_ai.store_service.enums.BranchStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * Thực thể chi nhánh cửa hàng.
 * Mỗi branch là một địa điểm vật lý của Smart Cafe.
 */
@Entity
@Table(name = "Branches")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Branch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "code", nullable = false, unique = true, length = 20)
    private String code;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "address", nullable = false, length = 255)
    private String address;

    @Column(name = "phone", length = 20)
    private String phone;

    /**
     * Múi giờ chi nhánh (tz database name), mặc định Asia/Ho_Chi_Minh.
     * Dùng để hiển thị giờ mở/đóng cửa theo giờ địa phương.
     */
    @Column(name = "timezone", nullable = false, length = 50)
    @Builder.Default
    private String timezone = "Asia/Ho_Chi_Minh";

    @Column(name = "opening_time")
    private java.sql.Time openingTime;

    @Column(name = "closing_time")
    private java.sql.Time closingTime;

    @Column(name = "accepts_online_orders", nullable = false)
    @Builder.Default
    private Boolean acceptsOnlineOrders = true;

    /**
     * NULL = không cung cấp dịch vụ giao hàng.
     */
    @Column(name = "delivery_radius_km", precision = 5, scale = 2)
    private BigDecimal deliveryRadiusKm;

    @Column(name = "delivery_fee", nullable = false, precision = 15, scale = 0)
    @Builder.Default
    private BigDecimal deliveryFee = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private BranchStatus status = BranchStatus.Active;
}
