from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity

from src.app.recommendation.preprocessing.preprocessing import load_products, load_interactions
from src.app.recommendation.features.features import create_tfidf_features, create_user_item_matrix

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data_mock"


class RecommendationService:
    """Content-based + item-based collaborative + hybrid recommendation."""

    def __init__(self, data_dir: Path | None = None):
        self.data_dir = data_dir or DATA_DIR
        products_path = self.data_dir / "products.csv"
        interactions_path = self.data_dir / "user_item_summary.csv"
        if not products_path.exists() or not interactions_path.exists():
            raise FileNotFoundError(
                f"Recommendation CSV missing. Expected {products_path} and {interactions_path}"
            )

        self.products = load_products(products_path).reset_index(drop=True)
        self.interactions = load_interactions(interactions_path)
        self.tfidf_matrix, self.vectorizer = create_tfidf_features(self.products)
        self.content_similarity = cosine_similarity(self.tfidf_matrix)
        self.product_ids = self.products["product_id"].astype(int).tolist()
        self.product_index = {pid: idx for idx, pid in enumerate(self.product_ids)}
        self.product_lookup = {
            int(row.product_id): {
                "name": str(row.name),
                "category": str(row.category),
                "description": str(row.description),
                "price_vnd": int(row.price_vnd),
            }
            for row in self.products.itertuples(index=False)
        }
        self.user_item = create_user_item_matrix(self.interactions)
        self.item_similarity = cosine_similarity(self.user_item.T) if not self.user_item.empty else None
        self.item_ids = [int(x) for x in self.user_item.columns]
        self.item_index = {pid: i for i, pid in enumerate(self.item_ids)}
        self.popularity = (
            self.interactions.groupby("product_id")["quantity"].sum().to_dict()
        )

    @staticmethod
    def _normalize(scores: dict[int, float]) -> dict[int, float]:
        if not scores:
            return {}
        lo, hi = min(scores.values()), max(scores.values())
        if hi == lo:
            return {pid: 1.0 for pid in scores}
        return {pid: (score - lo) / (hi - lo) for pid, score in scores.items()}

    def _content_scores(self, product_id: int, top_k: int = 30) -> dict[int, float]:
        if product_id not in self.product_index:
            return {}
        idx = self.product_index[product_id]
        row = self.content_similarity[idx]
        pairs = [
            (pid, float(row[i])) for i, pid in enumerate(self.product_ids)
            if pid != product_id and row[i] > 0
        ]
        pairs.sort(key=lambda x: x[1], reverse=True)
        return dict(pairs[:top_k])

    def _collaborative_scores(self, user_id: str, top_k: int = 50) -> dict[int, float]:
        user_id = str(user_id)
        if self.item_similarity is None or user_id not in self.user_item.index:
            return {}
        user_vector = self.user_item.loc[user_id]
        purchased = set(int(pid) for pid in user_vector[user_vector > 0].index)
        if not purchased:
            return {}
        scores: dict[int, float] = {}
        for pid in purchased:
            if pid not in self.item_index:
                continue
            idx = self.item_index[pid]
            quantity = float(user_vector[pid])
            for j, similarity in enumerate(self.item_similarity[idx]):
                candidate = self.item_ids[j]
                if candidate in purchased or similarity <= 0:
                    continue
                scores[candidate] = scores.get(candidate, 0.0) + float(similarity) * quantity
        return dict(sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_k])

    def _popular_scores(self, top_k: int = 50) -> dict[int, float]:
        items = sorted(self.popularity.items(), key=lambda x: x[1], reverse=True)
        return {int(pid): float(score) for pid, score in items[:top_k]}

    def recommend(self, user_id: str | None = None, product_id: int | None = None, top_k: int = 5):
        if not 1 <= top_k <= 50:
            raise ValueError("top_k must be between 1 and 50")
        content = self._content_scores(product_id, 100) if product_id is not None else {}
        collaborative = self._collaborative_scores(user_id, 100) if user_id else {}
        popular = self._popular_scores(100)

        # Blend content and CF when available; popular products provide a cold-start fallback.
        content_n = self._normalize(content)
        collaborative_n = self._normalize(collaborative)
        popular_n = self._normalize(popular)
        candidate_ids = set(content_n) | set(collaborative_n)
        if not candidate_ids:
            candidate_ids = set(popular_n)
        results = []
        for pid in candidate_ids:
            if product_id is not None and pid == product_id:
                continue
            has_content = pid in content_n
            has_cf = pid in collaborative_n
            if has_content and has_cf:
                score = 0.4 * content_n[pid] + 0.6 * collaborative_n[pid]
                reason, kind = "Kết hợp đặc điểm món và lịch sử mua hàng", "Hybrid"
            elif has_cf:
                score = 0.85 * collaborative_n[pid] + 0.15 * popular_n.get(pid, 0.0)
                reason, kind = "Phù hợp với lịch sử mua hàng của bạn", "Collaborative"
            elif has_content:
                score = 0.85 * content_n[pid] + 0.15 * popular_n.get(pid, 0.0)
                reason, kind = "Có đặc điểm tương tự món bạn đang xem", "Content-Based"
            else:
                score = popular_n.get(pid, 0.0)
                reason, kind = "Món được mua phổ biến tại quán", "Trending"
            if pid not in self.product_lookup:
                continue
            item = self.product_lookup[pid]
            results.append({
                "product_id": pid,
                "name": item["name"],
                "category": item["category"],
                "price_vnd": item["price_vnd"],
                "score": round(float(score), 4),
                "reason": reason,
                "recommendation_type": kind,
            })
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]


@lru_cache(maxsize=1)
def get_recommendation_service() -> RecommendationService:
    return RecommendationService()
