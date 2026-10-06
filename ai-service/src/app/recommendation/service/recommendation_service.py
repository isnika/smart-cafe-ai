from __future__ import annotations

from .collaborative import ItemBasedCollaborativeRecommender
from .content_based import ContentBasedRecommender
from .hybrid import hybrid_merge
from .preprocessing import interactions_dataframe, products_dataframe
from .repository import RecommendationRepository


class RecommendationService:
    def __init__(self, repository: RecommendationRepository):
        self.repository = repository
        self.content = ContentBasedRecommender()
        self.collaborative = ItemBasedCollaborativeRecommender()
        self.products = products_dataframe(self.repository.get_products())
        self.interactions = interactions_dataframe(self.repository.get_purchase_interactions())

        self.content.fit(self.products)
        self.collaborative.fit(self.interactions)

        self.product_names = dict(zip(self.products["product_id"], self.products["name"]))

    def recommend(self, user_id: str | None, product_id: int | None, top_k: int = 5):
        content_results = []
        cf_results = []

        if product_id is not None:
            content_results = self.content.recommend(product_id, top_k=max(top_k * 3, 10))

        if user_id:
            exclude = {product_id} if product_id is not None else set()
            cf_results = self.collaborative.recommend(
                user_id,
                top_k=max(top_k * 3, 10),
                exclude_product_ids=exclude,
            )

        # Hybrid when at least one personalized signal exists.
        if content_results or cf_results:
            merged = hybrid_merge(content_results, cf_results, top_k=top_k)
            results = []
            for item in merged:
                pid = item["product_id"]
                if pid == product_id:
                    continue
                if "content_score" in item and "collaborative_score" in item:
                    reason = "Gợi ý kết hợp đặc điểm món và lịch sử mua hàng"
                    rec_type = "Personalized"
                elif item.get("content_score", 0) > 0:
                    reason = "Vì món này có đặc điểm tương tự món bạn đang xem"
                    rec_type = "Cross_Sell"
                else:
                    reason = "Vì phù hợp với lịch sử mua hàng của bạn"
                    rec_type = "Personalized"

                results.append({
                    "product_id": pid,
                    "name": self.product_names.get(pid, ""),
                    "score": round(float(item["score"]), 4),
                    "reason": reason,
                    "recommendation_type": rec_type,
                })
            results = results[:top_k]
            if user_id:
                self.repository.save_recommendations(user_id, results)
            return results

        # Cold-start fallback: popular products.
        popular = self.repository.get_popular_products(limit=max(top_k * 2, 10))
        results = []
        for item in popular:
            pid = int(item["product_id"])
            if pid == product_id:
                continue
            results.append({
                "product_id": pid,
                "name": self.product_names.get(pid, ""),
                "score": 0.0,
                "reason": "Món được mua phổ biến tại quán",
                "recommendation_type": "Trending",
            })
        results = results[:top_k]
        if user_id:
            self.repository.save_recommendations(user_id, results)
        return results
