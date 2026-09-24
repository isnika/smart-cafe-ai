from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


class ContentBasedRecommender:
    def __init__(self):
        self.vectorizer = TfidfVectorizer(
            lowercase=True,
            ngram_range=(1, 2),
            min_df=1,
        )
        self.products: pd.DataFrame | None = None
        self.matrix = None
        self.index_by_product: dict[int, int] = {}

    def fit(self, products: pd.DataFrame) -> "ContentBasedRecommender":
        self.products = products.reset_index(drop=True).copy()
        if self.products.empty:
            self.matrix = None
            self.index_by_product = {}
            return self

        self.matrix = self.vectorizer.fit_transform(self.products["text"])
        self.index_by_product = {
            int(pid): idx for idx, pid in enumerate(self.products["product_id"])
        }
        return self

    def recommend(self, product_id: int, top_k: int = 5) -> list[dict]:
        if self.matrix is None or product_id not in self.index_by_product:
            return []

        idx = self.index_by_product[product_id]
        scores = cosine_similarity(self.matrix[idx], self.matrix).ravel()
        scores[idx] = -1.0  # never recommend the same product

        top_indices = np.argsort(scores)[::-1][:top_k]
        results = []
        for i in top_indices:
            if scores[i] <= 0:
                continue
            row = self.products.iloc[i]
            results.append({
                "product_id": int(row["product_id"]),
                "name": row["name"],
                "score": float(scores[i]),
            })
        return results
