from __future__ import annotations

import pandas as pd


def load_products(file_path: str) -> pd.DataFrame:
    """
    Đọc và preprocessing dữ liệu sản phẩm.
    """

    df = pd.read_csv(file_path)

    # =========================
    # NORMALIZE COLUMN NAMES
    # =========================

    df.columns = (
        df.columns
        .str.strip()
        .str.lower()
    )

    # =========================
    # REQUIRED COLUMNS
    # =========================

    required_columns = [
        "product_id",
        "name",
        "category",
        "description"
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

    # =========================
    # HANDLE MISSING VALUES
    # =========================

    df["name"] = df["name"].fillna("")
    df["category"] = df["category"].fillna("")
    df["description"] = df["description"].fillna("")

    # =========================
    # NORMALIZE DATA TYPES
    # =========================

    df["product_id"] = pd.to_numeric(
        df["product_id"],
        errors="coerce"
    )

    df = df.dropna(
        subset=["product_id"]
    )

    df["product_id"] = df["product_id"].astype(int)

    # =========================
    # NORMALIZE TEXT
    # =========================

    df["name"] = (
        df["name"]
        .astype(str)
        .str.strip()
    )

    df["category"] = (
        df["category"]
        .astype(str)
        .str.strip()
    )

    df["description"] = (
        df["description"]
        .astype(str)
        .str.strip()
    )

    # =========================
    # CONTENT FOR TF-IDF
    # =========================

    df["content"] = (
        df["name"] + " "
        + df["category"] + " "
        + df["description"]
    )

    return df


def load_interactions(file_path: str) -> pd.DataFrame:
    """
    Đọc và preprocessing user-product interactions.

    Dùng user_item_summary.csv làm dữ liệu
    cho Collaborative Filtering.
    """

    df = pd.read_csv(file_path)

    # =========================
    # NORMALIZE COLUMN NAMES
    # =========================

    df.columns = (
        df.columns
        .str.strip()
        .str.lower()
    )

    # =========================
    # REQUIRED COLUMNS
    # =========================

    required_columns = [
        "user_id",
        "product_id",
        "quantity"
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

    # =========================
    # USER ID
    # =========================

    df["user_id"] = (
        df["user_id"]
        .fillna("")
        .astype(str)
        .str.strip()
    )

    # Xóa user_id rỗng
    df = df[
        df["user_id"] != ""
    ]

    # =========================
    # PRODUCT ID
    # =========================

    df["product_id"] = pd.to_numeric(
        df["product_id"],
        errors="coerce"
    )

    # =========================
    # QUANTITY
    # =========================

    df["quantity"] = pd.to_numeric(
        df["quantity"],
        errors="coerce"
    )

    # =========================
    # OPTIONAL COLUMNS
    # =========================

    if "rating" in df.columns:

        df["rating"] = pd.to_numeric(
            df["rating"],
            errors="coerce"
        )

    if "n_orders" in df.columns:

        df["n_orders"] = pd.to_numeric(
            df["n_orders"],
            errors="coerce"
        )

    if "last_purchase" in df.columns:

        df["last_purchase"] = pd.to_datetime(
            df["last_purchase"],
            errors="coerce"
        )

    # =========================
    # REMOVE INVALID ROWS
    # =========================

    df = df.dropna(
        subset=[
            "product_id",
            "quantity"
        ]
    )

    df["product_id"] = (
        df["product_id"]
        .astype(int)
    )

    # Quantity phải > 0
    df = df[
        df["quantity"] > 0
    ]

    return df


def prepare_data(
    products_path: str,
    interactions_path: str
):
    """
    Load và preprocessing toàn bộ dữ liệu recommendation.
    """

    products = load_products(
        products_path
    )

    interactions = load_interactions(
        interactions_path
    )

    return products, interactions