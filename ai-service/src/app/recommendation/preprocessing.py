from __future__ import annotations

import pandas as pd
'''
CSV
 ↓
Đọc dữ liệu
 ↓
Kiểm tra dữ liệu
 ↓
Xử lý missing
 ↓
Chuẩn hóa kiểu dữ liệu
 ↓
Trả DataFrame sạch
'''


import pandas as pd


def load_products(file_path: str) -> pd.DataFrame:
    """
    Đọc dữ liệu sản phẩm từ CSV.
    """

    df = pd.read_csv(file_path)

    # Chuẩn hóa tên cột
    df.columns = df.columns.str.strip().str.lower()

    # Kiểm tra các cột bắt buộc
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

    # Xử lý giá trị null
    df["name"] = df["name"].fillna("")
    df["category"] = df["category"].fillna("")
    df["description"] = df["description"].fillna("")

    # Chuẩn hóa text
    df["name"] = df["name"].astype(str).str.strip()
    df["category"] = df["category"].astype(str).str.strip()
    df["description"] = df["description"].astype(str).str.strip()

    # Tạo content cho Content-Based
    df["content"] = (
        df["name"] + " "
        + df["category"] + " "
        + df["description"]
    )

    return df


def load_interactions(file_path: str) -> pd.DataFrame:
    """
    Đọc dữ liệu tương tác user-product từ CSV.
    """

    df = pd.read_csv(file_path)

    # Chuẩn hóa tên cột
    df.columns = df.columns.str.strip().str.lower()

    # Kiểm tra các cột bắt buộc
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
            f"Collaborative CSV thiếu các cột: {missing_columns}"
        )

    # Xử lý null
    df["user_id"] = df["user_id"].fillna("")
    df["quantity"] = df["quantity"].fillna(0)

    # Chuẩn hóa kiểu dữ liệu
    df["user_id"] = df["user_id"].astype(str).str.strip()
    df["product_id"] = pd.to_numeric(
        df["product_id"],
        errors="coerce"
    )
    df["quantity"] = pd.to_numeric(
        df["quantity"],
        errors="coerce"
    )

    # Xóa dòng product_id hoặc quantity không hợp lệ
    df = df.dropna(
        subset=["product_id", "quantity"]
    )

    # Chuyển product_id về int
    df["product_id"] = df["product_id"].astype(int)

    # Quantity không được âm
    df = df[df["quantity"] > 0]

    return df


def prepare_data(
    products_path: str,
    interactions_path: str
):
    """
    Load và preprocessing toàn bộ dữ liệu recommendation.
    """

    products = load_products(products_path)

    interactions = load_interactions(interactions_path)

    return products, interactions