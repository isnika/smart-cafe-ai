package com.smart_cafe_ai.catalog_service.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.catalog_service.dto.ProductFilter;
import com.smart_cafe_ai.catalog_service.model.*;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import java.util.ArrayList;
import java.util.Locale;

public final class ProductSpecifications {
    private static final ObjectMapper JSON = new ObjectMapper();
    private ProductSpecifications() {}

    public static Specification<Product> publicMenu(ProductFilter filter) {
        return (root, query, cb) -> {
            var predicates = new ArrayList<Predicate>();
            predicates.add(cb.equal(root.get("status"), MenuStatus.Active));
            predicates.add(cb.equal(root.get("category").get("status"), MenuStatus.Active));
            if (filter.q() != null) {
                String escaped = filter.q().toLowerCase(Locale.ROOT)
                        .replace("!", "!!").replace("%", "!%").replace("_", "!_");
                predicates.add(cb.like(cb.lower(root.get("name")), "%" + escaped + "%", '!'));
            }
            if (filter.categoryId() != null) predicates.add(cb.equal(root.get("category").get("id"), filter.categoryId()));
            if (filter.temperature() != null) predicates.add(cb.equal(root.get("temperature"), filter.temperature()));
            if (filter.caffeineLevel() != null) predicates.add(cb.equal(root.get("caffeineLevel"), filter.caffeineLevel()));
            if (filter.minPrice() != null) predicates.add(cb.greaterThanOrEqualTo(root.get("price"), filter.minPrice()));
            if (filter.maxPrice() != null) predicates.add(cb.lessThanOrEqualTo(root.get("price"), filter.maxPrice()));
            if (filter.flavorTag() != null) {
                // JSON membership, not substring matching; Hibernate escapes the JSON scalar literal.
                predicates.add(cb.equal(cb.function("json_contains", Integer.class,
                        root.get("flavorTags"), cb.literal(jsonString(filter.flavorTag()))), 1));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private static String jsonString(String value) {
        try { return JSON.writeValueAsString(value); }
        catch (JsonProcessingException ex) { throw new IllegalStateException("Cannot encode flavor tag", ex); }
    }
}

