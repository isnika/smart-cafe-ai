package com.smart_cafe_ai.catalog_service.repository;
import com.smart_cafe_ai.catalog_service.model.VariantPriceHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.*;
public interface VariantPriceHistoryRepository extends JpaRepository<VariantPriceHistory,Long> {
    Page<VariantPriceHistory> findByVariantId(Integer variantId, Pageable pageable);
}
