package com.smart_cafe_ai.inventory_service.repository;

import com.smart_cafe_ai.inventory_service.entity.OptionRecipeAdjustment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface OptionRecipeAdjustmentRepository extends JpaRepository<OptionRecipeAdjustment, Long> {
    List<OptionRecipeAdjustment> findByOptionId(Integer optionId);
    void deleteByOptionId(Integer optionId);
    List<OptionRecipeAdjustment> findByOptionIdIn(List<Integer> optionIds);
}
