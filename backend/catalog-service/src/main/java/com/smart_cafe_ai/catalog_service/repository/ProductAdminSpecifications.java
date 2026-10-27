package com.smart_cafe_ai.catalog_service.repository;

import com.smart_cafe_ai.catalog_service.dto.product.ProductAdminFilter;
import com.smart_cafe_ai.catalog_service.model.Product;
import com.smart_cafe_ai.catalog_service.validation.VietnameseNameSearch;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import java.util.ArrayList;

public final class ProductAdminSpecifications {
    private ProductAdminSpecifications() {}
    public static Specification<Product> list(ProductAdminFilter filter) {
        return (root, query, cb) -> {
            var predicates = new ArrayList<Predicate>();
            if (filter.q() != null) {
                String escaped = VietnameseNameSearch.fold(filter.q()).replace("!", "!!").replace("%", "!%").replace("_", "!_");
                predicates.add(cb.like(VietnameseNameSearch.expression(cb, root.get("name")), "%" + escaped + "%", '!'));
            }
            if (filter.categoryId() != null) predicates.add(cb.equal(root.get("category").get("id"), filter.categoryId()));
            if (filter.status() != null) predicates.add(cb.equal(root.get("status"), filter.status()));
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    public static Specification<Product> duplicate(Integer categoryId, String name, Integer excludedId) {
        return (root, query, cb) -> cb.and(
                cb.equal(root.get("category").get("id"), categoryId),
                cb.equal(VietnameseNameSearch.expression(cb, root.get("name")), VietnameseNameSearch.fold(name)),
                excludedId == null ? cb.conjunction() : cb.notEqual(root.get("id"), excludedId));
    }
}
