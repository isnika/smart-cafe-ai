package com.smart_cafe_ai.catalog_service.repository;

import com.smart_cafe_ai.catalog_service.dto.category.CategoryFilter;
import com.smart_cafe_ai.catalog_service.model.Category;
import org.springframework.data.jpa.domain.Specification;
import com.smart_cafe_ai.catalog_service.validation.VietnameseNameSearch;

public final class CategorySpecifications {
    private CategorySpecifications() {}

    public static Specification<Category> adminList(CategoryFilter filter) {
        return (root, query, cb) -> {
            var predicate = cb.conjunction();
            if (filter.status() != null) predicate = cb.and(predicate, cb.equal(root.get("status"), filter.status()));
            if (filter.q() != null) {
                String escaped = VietnameseNameSearch.fold(filter.q())
                        .replace("!", "!!").replace("%", "!%").replace("_", "!_");
                predicate = cb.and(predicate, cb.like(VietnameseNameSearch.expression(cb, root.get("name")),
                        "%" + escaped + "%", '!'));
            }
            return predicate;
        };
    }
}

