package com.smart_cafe_ai.catalog_service.security;

public record CatalogActor(String userId, String ipAddress) {
    public static final String ATTRIBUTE = "catalog.actor";
}

