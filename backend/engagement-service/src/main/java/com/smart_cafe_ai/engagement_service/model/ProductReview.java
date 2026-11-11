package com.smart_cafe_ai.engagement_service.model;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.persistence.*;
import org.hibernate.annotations.Check;
import java.time.Instant;
import static com.smart_cafe_ai.engagement_service.model.Types.*;

@Entity @Table(name = "Product_Reviews", uniqueConstraints = @UniqueConstraint(columnNames = {"order_item_id", "user_id"}))
@Check(constraints = "rating between 1 and 5")
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class ProductReview {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "product_id", nullable = false) public Integer productId;
    @Column(name = "user_id", nullable = false, length = 36) public String userId;
    @Column(name = "order_item_id", nullable = false) public Long orderItemId;
    @Column(nullable = false) public int rating;
    @Column(columnDefinition = "text") public String comment;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public ReviewStatus status = ReviewStatus.Pending;
    @Column(name = "moderated_by", length = 36) public String moderatedBy;
    @Column(name = "moderated_at") public Instant moderatedAt;
    @Column(name = "created_at", nullable = false) public Instant createdAt = Instant.now();
}
