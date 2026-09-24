from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity


class ItemBasedCollaborativeRecommender:
    """Simple item-based CF using a user-item purchase matrix."""

    def __init__(self):
        self.matrix: pd.DataFrame | None = None
        self.item_similarity: pd.DataFrame | None = None

    def fit(self, interactions: pd.DataFrame) -> "ItemBasedCollaborativeRecommender":
        if interactions.empty:
            self.matrix = pd.DataFrame()
            self.item_similarity = pd.DataFrame()
            return self

        self.matrix = interactions.pivot_table(
            index="user_id",
            columns="product_id",
            values="interaction",
            aggfunc="sum",
            fill_value=0,
        )

        similarity = cosine_similarity(self.matrix.T)
        self.item_similarity = pd.DataFrame(
            similarity,
            index=self.matrix.columns,
            columns=self.matrix.columns,
        )
        return self

    def recommend(
        self,
        user_id: str,
        top_k: int = 5,
        exclude_product_ids: set[int] | None = None,
    ) -> list[dict]:
        if self.matrix is None or self.matrix.empty or user_id not in self.matrix.index:
            return []

        user_vector = self.matrix.loc[user_id]
        purchased = user_vector[user_vector > 0]
        if purchased.empty:
            return []

        scores = pd.Series(0.0, index=self.matrix.columns)
        weights = purchased / purchased.sum()

        for product_id, weight in weights.items():
            scores += self.item_similarity[product_id] * float(weight)

        exclude = set(purchased.index.astype(int))
        if exclude_product_ids:
            exclude.update(exclude_product_ids)
        scores.loc[list(exclude & set(scores.index))] = -1.0

        scores = scores.sort_values(ascending=False)
        results = []
        for product_id, score in scores.head(top_k).items():
            if score <= 0:
                continue
            results.append({
                "product_id": int(product_id),
                "score": float(score),
            })
        return results
