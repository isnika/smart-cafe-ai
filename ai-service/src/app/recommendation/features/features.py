"""
Feature Engineering cho Recommendation System.

Luồng xử lý:

products.csv
    ↓
preprocessing.py
    ↓
products["content"]
    ↓
TF-IDF
    ↓
content_based.py


user_item_summary.csv
    ↓
preprocessing.py
    ↓
user_id + product_id + quantity
    ↓
User-Item Matrix
    ↓
collaborative.py
"""

from __future__ import annotations

import pandas as pd

from sklearn.feature_extraction.text import TfidfVectorizer


# ============================================================
# CONTENT-BASED FEATURES
# ============================================================

def create_tfidf_features(
    products: pd.DataFrame,
    max_features: int = 5000,
):
    """
    Tạo TF-IDF features từ thông tin sản phẩm.

    Parameters
    ----------
    products : pd.DataFrame
        DataFrame sản phẩm đã được preprocessing.

        Bắt buộc phải có:
            product_id
            content

    max_features : int
        Số lượng vocabulary tối đa của TF-IDF.

    Returns
    -------
    tfidf_matrix
        Ma trận TF-IDF của sản phẩm.

    vectorizer
        TF-IDF Vectorizer đã được fit.
    """

    # --------------------------------------------------------
    # Validate dataframe
    # --------------------------------------------------------

    if products.empty:
        raise ValueError(
            "Products dataframe is empty."
        )

    required_columns = [
        "product_id",
        "content",
    ]

    missing_columns = [
        column
        for column in required_columns
        if column not in products.columns
    ]

    if missing_columns:
        raise ValueError(
            "Products dataframe thiếu các cột: "
            f"{missing_columns}"
        )

    # --------------------------------------------------------
    # Clean content
    # --------------------------------------------------------

    content = (
        products["content"]
        .fillna("")
        .astype(str)
        .str.strip()
    )

    if content.eq("").all():
        raise ValueError(
            "Products content không có dữ liệu."
        )

    # --------------------------------------------------------
    # TF-IDF
    # --------------------------------------------------------

    vectorizer = TfidfVectorizer(
        lowercase=True,
        ngram_range=(1, 2),
        max_features=max_features,
    )

    tfidf_matrix = vectorizer.fit_transform(
        content
    )

    return tfidf_matrix, vectorizer


# ============================================================
# COLLABORATIVE FILTERING FEATURES
# ============================================================

def create_user_item_matrix(
    interactions: pd.DataFrame,
) -> pd.DataFrame:
    """
    Tạo User-Item Interaction Matrix.

    Rows:
        user_id

    Columns:
        product_id

    Values:
        quantity

    Ví dụ:

                product_1  product_2  product_3
        user_1      3          0          2
        user_2      0          1          4
        user_3      2          0          0

    Quantity được dùng làm tín hiệu implicit feedback:

        quantity càng lớn
        → mức độ tương tác với sản phẩm càng cao.
    """

    # --------------------------------------------------------
    # Validate dataframe
    # --------------------------------------------------------

    if interactions.empty:
        raise ValueError(
            "Interactions dataframe is empty."
        )

    required_columns = [
        "user_id",
        "product_id",
        "quantity",
    ]

    missing_columns = [
        column
        for column in required_columns
        if column not in interactions.columns
    ]

    if missing_columns:
        raise ValueError(
            "Interactions dataframe thiếu các cột: "
            f"{missing_columns}"
        )

    # --------------------------------------------------------
    # Create matrix
    # --------------------------------------------------------

    user_item_matrix = interactions.pivot_table(
        index="user_id",
        columns="product_id",
        values="quantity",
        aggfunc="sum",
        fill_value=0,
    )

    # --------------------------------------------------------
    # Sort để kết quả ổn định
    # --------------------------------------------------------

    user_item_matrix = user_item_matrix.sort_index()

    user_item_matrix = user_item_matrix.sort_index(
        axis=1
    )

    return user_item_matrix