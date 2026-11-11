package com.smart_cafe_ai.catalog_service.integration;

/** Store owns branches. A successful Catalog lookup must never be inferred from a numeric ID. */
public interface StoreBranchVerifier {
    void requireExists(Integer branchId);
}
