'''
1. Product → TF-IDF features
2. User + Product + Quantity → User-Item Matrix
'''
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer


def create_tfidf_features(
    products: pd.DataFrame,
    max_features: int = 5000
):
    """
    Tạo TF-IDF feature từ thông tin sản phẩm.

    Input:
        products:
            DataFrame chứa cột `content`

    Output:
        tfidf_matrix:
            Ma trận TF-IDF của các sản phẩm

        vectorizer:
            TF-IDF Vectorizer đã được fit
    """

    if products.empty:
        raise ValueError("Products dataframe is empty.")

    if "content" not in products.columns:
        raise ValueError(
            "Products dataframe phải có cột 'content'."
        )

    vectorizer = TfidfVectorizer(
        lowercase=True,
        ngram_range=(1, 2),
        max_features=max_features
    )

    tfidf_matrix = vectorizer.fit_transform(
        products["content"]
    )

    return tfidf_matrix, vectorizer


def create_user_item_matrix(
    interactions: pd.DataFrame
):
    """
    Tạo User-Item Interaction Matrix
    cho Collaborative Filtering.

    Rows    = user
    Columns = product
    Values  = quantity
    """

    if interactions.empty:
        raise ValueError(
            "Interactions dataframe is empty."
        )

    required_columns = [
        "user_id",
        "product_id",
        "quantity"
    ]

    for column in required_columns:
        if column not in interactions.columns:
            raise ValueError(
                f"Interactions dataframe thiếu cột '{column}'."
            )

    user_item_matrix = interactions.pivot_table(
        index="user_id",
        columns="product_id",
        values="quantity",
        aggfunc="sum",
        fill_value=0
    )

    return user_item_matrix