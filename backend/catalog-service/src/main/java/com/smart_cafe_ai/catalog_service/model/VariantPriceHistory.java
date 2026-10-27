package com.smart_cafe_ai.catalog_service.model;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.*;

@Entity @Table(name="Variant_Price_History") @Getter @NoArgsConstructor
public class VariantPriceHistory {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
    @Column(name="variant_id",nullable=false) private Integer variantId;
    @ManyToOne(fetch=FetchType.LAZY)
    @JoinColumn(name="variant_id",insertable=false,updatable=false,foreignKey=@ForeignKey(name="fk_price_history_variant"))
    private ProductVariant variant;
    @Column(name="old_price",precision=15,scale=0) private BigDecimal oldPrice;
    @Column(name="new_price",nullable=false,precision=15,scale=0) private BigDecimal newPrice;
    @Column(name="changed_by",length=36) private String changedBy;
    @Column(name="changed_at",nullable=false) private LocalDateTime changedAt;
    public VariantPriceHistory(Integer id,BigDecimal before,BigDecimal after,String actor) {
        variantId=id;oldPrice=before;newPrice=after;changedBy=actor;changedAt=LocalDateTime.now(ZoneOffset.UTC).withNano(0);
    }
}
