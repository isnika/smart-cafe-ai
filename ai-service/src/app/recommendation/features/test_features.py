"""
Test Feature Engineering cho Recommendation System.

Test:
1. Load preprocessing data.
2. Tạo TF-IDF matrix.
3. Tạo User-Item Matrix.
4. Kiểm tra kích thước.
5. Kiểm tra dữ liệu.
"""

from __future__ import annotations

from pathlib import Path

from preprocessing.preprocessing import prepare_data

from features.features import (
    create_tfidf_features,
    create_user_item_matrix,
)

# ============================================================
# PATH
# ============================================================

CURRENT_DIR = Path(__file__).resolve().parent

# recommendation/
RECOMMENDATION_DIR = CURRENT_DIR.parent

# recommendation/data/
DATA_DIR = RECOMMENDATION_DIR / "data_mock"


# ============================================================
# TEST
# ============================================================

def test_features():

    # ========================================================
    # 1. DATA PATH
    # ========================================================

    products_path = (
        DATA_DIR / "products.csv"
    )

    interactions_path = (
        DATA_DIR / "user_item_summary.csv"
    )

    print("\n========================================")
    print("DATA PATH")
    print("========================================")

    print(
        "Products:",
        products_path
    )

    print(
        "Products exists:",
        products_path.exists()
    )

    print(
        "Interactions:",
        interactions_path
    )

    print(
        "Interactions exists:",
        interactions_path.exists()
    )

    # ========================================================
    # 2. CHECK FILE
    # ========================================================

    assert products_path.exists(), (
        f"Không tìm thấy: {products_path}"
    )

    assert interactions_path.exists(), (
        f"Không tìm thấy: {interactions_path}"
    )

    # ========================================================
    # 3. PREPROCESSING
    # ========================================================

    products, interactions = prepare_data(
        products_path,
        interactions_path,
    )

    print("\n========================================")
    print("PREPROCESSING DATA")
    print("========================================")

    print(
        "Products shape:",
        products.shape
    )

    print(
        "Interactions shape:",
        interactions.shape
    )

    # ========================================================
    # 4. CREATE TF-IDF
    # ========================================================

    tfidf_matrix, vectorizer = (
        create_tfidf_features(
            products
        )
    )

    print("\n========================================")
    print("TF-IDF FEATURES")
    print("========================================")

    print(
        "Number of products:",
        len(products)
    )

    print(
        "TF-IDF matrix shape:",
        tfidf_matrix.shape
    )

    print(
        "Vocabulary size:",
        len(vectorizer.vocabulary_)
    )

    # ========================================================
    # 5. CREATE USER-ITEM MATRIX
    # ========================================================

    user_item_matrix = (
        create_user_item_matrix(
            interactions
        )
    )

    print("\n========================================")
    print("USER-ITEM MATRIX")
    print("========================================")

    print(
        "Number of users:",
        user_item_matrix.shape[0]
    )

    print(
        "Number of products:",
        user_item_matrix.shape[1]
    )

    print(
        "Matrix shape:",
        user_item_matrix.shape
    )

    print("\nFirst 5 users:")
    print(
        user_item_matrix.head()
    )

    # ========================================================
    # 6. VALIDATE TF-IDF
    # ========================================================

    assert tfidf_matrix.shape[0] == len(
        products
    ), (
        "Số dòng TF-IDF phải bằng số sản phẩm."
    )

    assert tfidf_matrix.shape[1] > 0, (
        "TF-IDF phải có ít nhất một feature."
    )

    assert len(
        vectorizer.vocabulary_
    ) > 0, (
        "Vocabulary của TF-IDF không được rỗng."
    )

    # ========================================================
    # 7. VALIDATE USER-ITEM MATRIX
    # ========================================================

    expected_users = (
        interactions["user_id"]
        .nunique()
    )

    expected_products = (
        interactions["product_id"]
        .nunique()
    )

    assert (
        user_item_matrix.shape[0]
        == expected_users
    ), (
        "Số user trong User-Item Matrix không đúng."
    )

    assert (
        user_item_matrix.shape[1]
        == expected_products
    ), (
        "Số product trong User-Item Matrix không đúng."
    )

    # ========================================================
    # 8. VALIDATE QUANTITY
    # ========================================================

    assert (
        user_item_matrix.values >= 0
    ).all(), (
        "Quantity không được âm."
    )

    # ========================================================
    # 9. VALIDATE NO DUPLICATE
    # ========================================================

    assert not interactions.duplicated(
        subset=[
            "user_id",
            "product_id",
        ]
    ).any(), (
        "Không được có duplicate user-product."
    )

    # ========================================================
    # 10. RESULT
    # ========================================================

    print("\n========================================")
    print("FEATURES TEST PASSED")
    print("========================================")


if __name__ == "__main__":
    test_features()