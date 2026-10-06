from __future__ import annotations

from preprocessing import prepare_data


def test_prepare_data():
    # ============================================
    # 1. LOAD + PREPROCESSING
    # ============================================

    products, interactions = prepare_data(
        "../data_mock/products.csv",
        "../data_mock/user_item_summary.csv",
    )

    # ============================================
    # 2. PRODUCTS
    # ============================================

    print("\n===== PRODUCTS =====")
    print(products.head())

    print("\n===== PRODUCT COLUMNS =====")
    print(products.columns.tolist())

    print("\nProduct shape:", products.shape)

    # ============================================
    # 3. INTERACTIONS
    # ============================================

    print("\n===== INTERACTIONS =====")
    print(interactions.head())

    print("\n===== INTERACTION COLUMNS =====")
    print(interactions.columns.tolist())

    print("\nInteraction shape:", interactions.shape)

    # ============================================
    # 4. UNIQUE USERS / PRODUCTS
    # ============================================

    print("\n===== UNIQUE COUNTS =====")

    print(
        "Number of users:",
        interactions["user_id"].nunique()
    )

    print(
        "Number of products:",
        interactions["product_id"].nunique()
    )

    # ============================================
    # 5. MISSING VALUES
    # ============================================

    print("\n===== PRODUCTS MISSING VALUES =====")
    print(products.isna().sum())

    print("\n===== INTERACTIONS MISSING VALUES =====")
    print(interactions.isna().sum())

    # ============================================
    # 6. BASIC VALIDATION
    # ============================================

    assert not products.empty
    assert not interactions.empty

    assert products["product_id"].notna().all()
    assert interactions["user_id"].notna().all()
    assert interactions["product_id"].notna().all()

    assert (interactions["quantity"] > 0).all()
    assert (interactions["n_orders"] > 0).all()

    # Product ID không bị trùng
    assert products["product_id"].is_unique

    # Mỗi user-product chỉ có 1 dòng
    assert not interactions.duplicated(
        subset=["user_id", "product_id"]
    ).any()

    print("\n========================================")
    print("PREPROCESSING TEST PASSED")
    print("========================================")


if __name__ == "__main__":
    test_prepare_data()