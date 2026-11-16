import pandas as pd

''''
Content result
      ↓
Hybrid
      ↑
Collaborative result
'''


class HybridRecommender:

    def __init__(
        self,
        content_weight: float = 0.5,
        collaborative_weight: float = 0.5
    ):
        if content_weight < 0 or collaborative_weight < 0:
            raise ValueError(
                "Weights không được nhỏ hơn 0."
            )

        if content_weight + collaborative_weight == 0:
            raise ValueError(
                "Tổng weights phải lớn hơn 0."
            )

        self.content_weight = content_weight
        self.collaborative_weight = collaborative_weight

        self.products = None
        self.product_lookup = {}

    def fit(
        self,
        products: pd.DataFrame
    ):
        if products.empty:
            raise ValueError(
                "Products dataframe is empty."
            )

        required_columns = [
            "product_id",
            "name"
        ]

        for column in required_columns:
            if column not in products.columns:
                raise ValueError(
                    f"Products dataframe thiếu cột '{column}'."
                )

        self.products = products.reset_index(drop=True)

        self.product_lookup = {
            int(row["product_id"]): row["name"]
            for _, row in self.products.iterrows()
        }

    def _normalize_scores(
        self,
        recommendations: list
    ):
        if not recommendations:
            return {}

        scores = [
            float(item["score"])
            for item in recommendations
        ]

        min_score = min(scores)
        max_score = max(scores)

        # Nếu tất cả score giống nhau
        if max_score == min_score:
            return {
                int(item["product_id"]): 1.0
                for item in recommendations
            }

        normalized = {}

        for item in recommendations:

            product_id = int(item["product_id"])
            score = float(item["score"])

            normalized[product_id] = (
                (score - min_score)
                / (max_score - min_score)
            )

        return normalized

    def recommend(
        self,
        content_recommendations: list,
        collaborative_recommendations: list,
        top_k: int = 5
    ):
        if self.products is None:
            raise ValueError(
                "Hybrid model chưa được fit."
            )

        if top_k <= 0:
            raise ValueError(
                "top_k phải lớn hơn 0."
            )

        # 1. Normalize score của từng model
        content_scores = self._normalize_scores(
            content_recommendations
        )

        collaborative_scores = self._normalize_scores(
            collaborative_recommendations
        )

        # 2. Lấy tất cả product xuất hiện
        product_ids = set(
            content_scores.keys()
        ).union(
            collaborative_scores.keys()
        )

        # 3. Tính hybrid score
        hybrid_scores = {}

        for product_id in product_ids:

            content_score = content_scores.get(
                product_id,
                0.0
            )

            collaborative_score = (
                collaborative_scores.get(
                    product_id,
                    0.0
                )
            )

            hybrid_score = (
                self.content_weight * content_score
                +
                self.collaborative_weight
                * collaborative_score
            )

            hybrid_scores[product_id] = hybrid_score

        # 4. Sắp xếp
        sorted_products = sorted(
            hybrid_scores.items(),
            key=lambda x: x[1],
            reverse=True
        )

        # 5. Tạo kết quả
        recommendations = []

        for product_id, score in sorted_products[:top_k]:

            product_name = self.product_lookup.get(
                product_id,
                "Unknown Product"
            )

            recommendations.append({
                "product_id": product_id,
                "product_name": product_name,
                "score": float(score)
            })

        return recommendations