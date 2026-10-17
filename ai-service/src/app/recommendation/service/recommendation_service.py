from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import math

import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity

from src.app.recommendation.preprocessing.preprocessing import load_products, load_interactions
from src.app.recommendation.features.features import create_tfidf_features, create_user_item_matrix

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data_mock"


class RecommendationService:
    """Personalized café recommendations using purchase history, recency, content and CF.

    The interaction CSV is implicit feedback: quantity/order count indicate interest,
    rating adjusts preference when present, and recent purchases count more heavily.
    """

    def __init__(self, data_dir: Path | None = None, recency_half_life_days: int = 60):
        self.data_dir = data_dir or DATA_DIR
        products_path = self.data_dir / "products.csv"
        interactions_path = self.data_dir / "user_item_summary.csv"
        if not products_path.exists() or not interactions_path.exists():
            raise FileNotFoundError(
                f"Recommendation CSV missing. Expected {products_path} and {interactions_path}"
            )

        self.products = load_products(products_path).reset_index(drop=True)
        self.interactions = load_interactions(interactions_path)
        # Only recommend products that exist in the current catalog.
        valid_ids = set(self.products["product_id"].astype(int))
        self.interactions = self.interactions[self.interactions["product_id"].isin(valid_ids)].copy()

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

        self.user_item = create_user_item_matrix(self.interactions) if not self.interactions.empty else pd.DataFrame()
        self.item_similarity = cosine_similarity(self.user_item.T) if not self.user_item.empty else None
        self.item_ids = [int(x) for x in self.user_item.columns] if not self.user_item.empty else []
        self.item_index = {pid: i for i, pid in enumerate(self.item_ids)}
        self.popularity = self.interactions.groupby("product_id")["quantity"].sum().to_dict()
        self.recency_half_life_days = max(1, int(recency_half_life_days))

    @staticmethod
    def _normalize(scores: dict[int, float]) -> dict[int, float]:
        """Scale non-negative scores to [0, 1] without rewarding absent candidates."""
        positive = {pid: max(0.0, float(score)) for pid, score in scores.items() if score > 0}
        if not positive:
            return {}
        high = max(positive.values())
        return {pid: score / high for pid, score in positive.items()}

    def _user_history(self, user_id: str) -> pd.DataFrame:
        if self.interactions.empty:
            return self.interactions.copy()
        history = self.interactions[self.interactions["user_id"].astype(str) == str(user_id)].copy()
        if history.empty:
            return history

        now = pd.Timestamp.now().normalize()
        history["last_purchase"] = pd.to_datetime(history["last_purchase"], errors="coerce")
        age_days = (now - history["last_purchase"]).dt.total_seconds().div(86400).fillna(365)
        age_days = age_days.clip(lower=0)
        recency = (0.5 ** (age_days / self.recency_half_life_days)).clip(lower=0.05)
        # Order count and quantity both represent interest; log prevents heavy buyers dominating.
        strength = history["quantity"].clip(lower=0).map(lambda x: math.log1p(float(x)))
        strength += 0.7 * history["n_orders"].clip(lower=0).map(lambda x: math.log1p(float(x)))
        ratings = history["rating"]
        rating_factor = pd.Series(1.0, index=history.index)
        rating_factor.loc[ratings.notna() & (ratings >= 4)] = 1.25
        rating_factor.loc[ratings.notna() & (ratings <= 2)] = 0.55
        history["preference_weight"] = (strength + 0.1) * recency * rating_factor
        return history

    def _history_content_scores(self, history: pd.DataFrame) -> dict[int, float]:
        """Recommend similar products based on all items in the customer's history."""
        scores: dict[int, float] = {}
        for row in history.itertuples(index=False):
            source_id = int(row.product_id)
            if source_id not in self.product_index:
                continue
            source_idx = self.product_index[source_id]
            weight = float(row.preference_weight)
            similarities = self.content_similarity[source_idx]
            for idx, candidate_id in enumerate(self.product_ids):
                if candidate_id == source_id:
                    continue
                similarity = float(similarities[idx])
                if similarity > 0:
                    scores[candidate_id] = scores.get(candidate_id, 0.0) + similarity * weight
        return scores

    def _collaborative_scores(self, user_id: str, history: pd.DataFrame, top_k: int = 100) -> dict[int, float]:
        """Item-item CF, weighted by the customer's recency-adjusted purchase history."""
        if self.item_similarity is None or str(user_id) not in self.user_item.index:
            return {}
        weights = {int(row.product_id): float(row.preference_weight) for row in history.itertuples(index=False)}
        purchased = set(weights)
        scores: dict[int, float] = {}
        for source_id, weight in weights.items():
            if source_id not in self.item_index:
                continue
            row = self.item_similarity[self.item_index[source_id]]
            for idx, similarity in enumerate(row):
                candidate_id = self.item_ids[idx]
                if candidate_id in purchased or similarity <= 0:
                    continue
                scores[candidate_id] = scores.get(candidate_id, 0.0) + float(similarity) * weight
        return dict(sorted(scores.items(), key=lambda item: item[1], reverse=True)[:top_k])

    def _popular_scores(self) -> dict[int, float]:
        return {int(pid): float(count) for pid, count in self.popularity.items()}

    def recommend(self, user_id: str | None = None, product_id: int | None = None, top_k: int = 5):
        if not 1 <= top_k <= 50:
            raise ValueError("top_k must be between 1 and 50")
        if product_id is not None and product_id not in self.product_index:
            raise ValueError(f"product_id={product_id} không tồn tại trong danh mục sản phẩm")

        history = self._user_history(str(user_id)) if user_id else self.interactions.iloc[0:0].copy()
        purchased_ids = set(history["product_id"].astype(int).tolist()) if not history.empty else set()

        content = self._history_content_scores(history) if not history.empty else {}
        # An explicitly viewed product is also a strong short-term signal.
        if product_id is not None:
            idx = self.product_index[product_id]
            row = self.content_similarity[idx]
            for i, candidate_id in enumerate(self.product_ids):
                if candidate_id != product_id and row[i] > 0:
                    content[candidate_id] = content.get(candidate_id, 0.0) + float(row[i]) * 1.5

        collaborative = self._collaborative_scores(str(user_id), history) if user_id and not history.empty else {}
        popular = self._popular_scores()
        content_n = self._normalize(content)
        collaborative_n = self._normalize(collaborative)
        popular_n = self._normalize(popular)

        candidate_ids = set(content_n) | set(collaborative_n) | set(popular_n)
        if user_id and history.empty:
            # Cold-start user: use popularity; do not pretend this is personalized.
            candidate_ids = set(popular_n)

        results = []
        for pid in candidate_ids:
            if pid not in self.product_lookup:
                continue
            if pid in purchased_ids:
                # Discovery recommendations avoid repeating an already purchased item.
                continue
            has_content = pid in content_n
            has_cf = pid in collaborative_n
            has_history = not history.empty

            if has_content and has_cf:
                score = 0.45 * content_n[pid] + 0.45 * collaborative_n[pid] + 0.10 * popular_n.get(pid, 0.0)
                reason, kind = "Dựa trên món bạn từng mua và khách có sở thích tương tự", "Hybrid-Personalized"
            elif has_content and (has_history or product_id is not None):
                score = 0.70 * content_n[pid] + 0.20 * collaborative_n.get(pid, 0.0) + 0.10 * popular_n.get(pid, 0.0)
                if product_id is not None and not has_history:
                    reason, kind = "Có đặc điểm tương tự món bạn đang xem", "Content-Based"
                else:
                    reason, kind = "Có hương vị hoặc đặc điểm gần với món bạn thường chọn", "History-Content"
            elif has_cf:
                score = 0.75 * collaborative_n[pid] + 0.25 * popular_n.get(pid, 0.0)
                reason, kind = "Khách có lịch sử mua tương tự cũng thường chọn món này", "Collaborative"
            else:
                score = popular_n.get(pid, 0.0)
                reason, kind = "Món được mua phổ biến tại quán", "Trending"

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

        results.sort(key=lambda item: (-item["score"], item["product_id"]))
        return results[:top_k]


@lru_cache(maxsize=1)
def get_recommendation_service() -> RecommendationService:
    return RecommendationService()
