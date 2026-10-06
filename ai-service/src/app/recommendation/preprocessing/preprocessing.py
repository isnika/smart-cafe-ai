from __future__ import annotations

from pathlib import Path

import pandas as pd


# ============================================================
# PRODUCTS
# ============================================================

def load_products(file_path: str | Path) -> pd.DataFrame:
    """
    Load và preprocessing dữ liệu sản phẩm.

    Source:
        products.csv

    Dùng cho:
        Content-Based Recommendation
    """

    df = pd.read_csv(file_path)

    # --------------------------------------------------------
    # 1. Normalize column names
    # --------------------------------------------------------

    df.columns = (
        df.columns
        .str.strip()
        .str.lower()
    )

    # --------------------------------------------------------
    # 2. Required columns
    # --------------------------------------------------------

    required_columns = [
        "product_id",
        "name",
        "category",
        "description",
        "price_vnd",
        "temperature",
        "caffeine_level",
        "flavor_tags",
        "launch_date",
    ]

    missing_columns = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            f"Products CSV thiếu các cột: {missing_columns}"
        )

    # --------------------------------------------------------
    # 3. Product ID
    # --------------------------------------------------------

    df["product_id"] = pd.to_numeric(
        df["product_id"],
        errors="coerce",
    )

    df = df.dropna(
        subset=["product_id"]
    )

    df["product_id"] = (
        df["product_id"]
        .astype(int)
    )

    # --------------------------------------------------------
    # 4. Remove duplicate products
    # --------------------------------------------------------

    df = df.drop_duplicates(
        subset=["product_id"],
        keep="first",
    )

    # --------------------------------------------------------
    # 5. Text columns
    # --------------------------------------------------------

    text_columns = [
        "name",
        "category",
        "description",
        "temperature",
        "caffeine_level",
        "flavor_tags",
    ]

    for column in text_columns:
        df[column] = (
            df[column]
            .fillna("")
            .astype(str)
            .str.strip()
        )

    # --------------------------------------------------------
    # 6. Price
    # --------------------------------------------------------

    df["price_vnd"] = pd.to_numeric(
        df["price_vnd"],
        errors="coerce",
    )

    df = df.dropna(
        subset=["price_vnd"]
    )

    df = df[
        df["price_vnd"] > 0
    ]

    # --------------------------------------------------------
    # 7. Launch date
    # --------------------------------------------------------

    df["launch_date"] = pd.to_datetime(
        df["launch_date"],
        errors="coerce",
    )

    # --------------------------------------------------------
    # 8. Content for TF-IDF
    # --------------------------------------------------------

    df["content"] = (
        df["name"]
        + " "
        + df["category"]
        + " "
        + df["description"]
        + " "
        + df["temperature"]
        + " "
        + df["caffeine_level"]
        + " "
        + df["flavor_tags"].str.replace(
            "|",
            " ",
            regex=False,
        )
    ).str.strip()

    # --------------------------------------------------------
    # 9. Sort
    # --------------------------------------------------------

    df = df.sort_values(
        "product_id"
    ).reset_index(drop=True)

    return df


# ============================================================
# USER-PRODUCT INTERACTIONS
# ============================================================

def load_interactions(
    file_path: str | Path,
) -> pd.DataFrame:
    """
    Load và preprocessing user-product interactions.

    Source:
        user_item_summary.csv

    Columns:
        user_id
        product_id
        quantity
        rating
        n_orders
        last_purchase

    Dùng cho:
        Collaborative Filtering
        Hybrid Recommendation
    """

    df = pd.read_csv(file_path)

    # --------------------------------------------------------
    # 1. Normalize column names
    # --------------------------------------------------------

    df.columns = (
        df.columns
        .str.strip()
        .str.lower()
    )

    # --------------------------------------------------------
    # 2. Required columns
    # --------------------------------------------------------

    required_columns = [
        "user_id",
        "product_id",
        "quantity",
        "rating",
        "n_orders",
        "last_purchase",
    ]

    missing_columns = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            f"Interactions CSV thiếu các cột: {missing_columns}"
        )

    # --------------------------------------------------------
    # 3. User ID
    # --------------------------------------------------------

    df["user_id"] = (
        df["user_id"]
        .fillna("")
        .astype(str)
        .str.strip()
    )

    # Remove empty user_id
    df = df[
        df["user_id"] != ""
    ]

    # --------------------------------------------------------
    # 4. Product ID
    # --------------------------------------------------------

    df["product_id"] = pd.to_numeric(
        df["product_id"],
        errors="coerce",
    )

    # --------------------------------------------------------
    # 5. Quantity
    # --------------------------------------------------------

    df["quantity"] = pd.to_numeric(
        df["quantity"],
        errors="coerce",
    )

    # --------------------------------------------------------
    # 6. Number of orders
    # --------------------------------------------------------

    df["n_orders"] = pd.to_numeric(
        df["n_orders"],
        errors="coerce",
    )

    # --------------------------------------------------------
    # 7. Rating
    # --------------------------------------------------------

    df["rating"] = pd.to_numeric(
        df["rating"],
        errors="coerce",
    )

    # --------------------------------------------------------
    # 8. Last purchase
    # --------------------------------------------------------

    df["last_purchase"] = pd.to_datetime(
        df["last_purchase"],
        errors="coerce",
    )

    # --------------------------------------------------------
    # 9. Remove invalid required data
    # --------------------------------------------------------

    df = df.dropna(
        subset=[
            "product_id",
            "quantity",
            "n_orders",
            "last_purchase",
        ]
    )

    # --------------------------------------------------------
    # 10. Normalize numeric types
    # --------------------------------------------------------

    df["product_id"] = (
        df["product_id"]
        .astype(int)
    )

    df["quantity"] = (
        df["quantity"]
        .astype(int)
    )

    df["n_orders"] = (
        df["n_orders"]
        .astype(int)
    )

    # --------------------------------------------------------
    # 11. Business rules
    # --------------------------------------------------------

    # User phải có ít nhất một lần mua
    df = df[
        df["quantity"] > 0
    ]

    # Số order phải > 0
    df = df[
        df["n_orders"] > 0
    ]

    # Rating nếu có phải nằm trong 1-5
    invalid_rating = (
        df["rating"].notna()
        & ~df["rating"].between(1, 5)
    )

    df.loc[
        invalid_rating,
        "rating"
    ] = pd.NA

    # --------------------------------------------------------
    # 12. Remove duplicate user-product rows
    # --------------------------------------------------------

    # user_item_summary vốn đã được aggregate.
    # Nếu có duplicate thì aggregate lại để đảm bảo
    # mỗi user-product chỉ có một interaction.
    df = (
        df.groupby(
            ["user_id", "product_id"],
            as_index=False,
        )
        .agg(
            quantity=("quantity", "sum"),
            rating=("rating", "mean"),
            n_orders=("n_orders", "sum"),
            last_purchase=("last_purchase", "max"),
        )
    )

    # --------------------------------------------------------
    # 13. Sort
    # --------------------------------------------------------

    df = df.sort_values(
        ["user_id", "product_id"]
    ).reset_index(drop=True)

    return df


# ============================================================
# PREPARE ALL RECOMMENDATION DATA
# ============================================================

def prepare_data(
    products_path: str | Path,
    interactions_path: str | Path,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Load và preprocessing toàn bộ dữ liệu
    cần thiết cho Recommendation.

    Returns:
        products
        interactions
    """

    products = load_products(
        products_path
    )

    interactions = load_interactions(
        interactions_path
    )

    return products, interactions
