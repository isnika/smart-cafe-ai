import math
import pandas as pd


class RecommendationEvaluator:

    def __init__(
        self,
        interactions: pd.DataFrame
    ):
        if interactions.empty:
            raise ValueError(
                "Interactions dataframe is empty."
            )

        required_columns = [
            "user_id",
            "product_id"
        ]

        for column in required_columns:
            if column not in interactions.columns:
                raise ValueError(
                    f"Interactions dataframe "
                    f"thiếu cột '{column}'."
                )

        self.interactions = interactions.copy()

    def get_relevant_products(
        self,
        user_id: str
    ):
        """
        Lấy các sản phẩm mà user đã tương tác.
        """

        user_data = self.interactions[
            self.interactions["user_id"] == user_id
        ]

        if user_data.empty:
            return set()

        relevant_products = set(
            user_data["product_id"]
            .astype(int)
            .tolist()
        )

        return relevant_products

    def precision_at_k(
        self,
        recommended_products: list,
        relevant_products: set,
        k: int
    ):
        """
        Precision@K =
        số sản phẩm relevant trong Top K
        / K
        """

        if k <= 0:
            raise ValueError(
                "k phải lớn hơn 0."
            )

        top_k = recommended_products[:k]

        if not top_k:
            return 0.0

        hits = sum(
            1
            for product_id in top_k
            if product_id in relevant_products
        )

        return hits / len(top_k)

    def recall_at_k(
        self,
        recommended_products: list,
        relevant_products: set,
        k: int
    ):
        """
        Recall@K =
        số sản phẩm relevant được tìm thấy
        / tổng số sản phẩm relevant
        """

        if k <= 0:
            raise ValueError(
                "k phải lớn hơn 0."
            )

        if not relevant_products:
            return 0.0

        top_k = recommended_products[:k]

        hits = sum(
            1
            for product_id in top_k
            if product_id in relevant_products
        )

        return hits / len(relevant_products)

    def ndcg_at_k(
        self,
        recommended_products: list,
        relevant_products: set,
        k: int
    ):
        """
        NDCG@K đánh giá:
        - sản phẩm đúng có nằm trong Top K không
        - và sản phẩm đúng nằm ở vị trí nào
        """

        if k <= 0:
            raise ValueError(
                "k phải lớn hơn 0."
            )

        top_k = recommended_products[:k]

        # DCG
        dcg = 0.0

        for index, product_id in enumerate(top_k):

            if product_id in relevant_products:

                position = index + 1

                dcg += (
                    1
                    / math.log2(position + 1)
                )

        # IDCG
        ideal_hits = min(
            len(relevant_products),
            k
        )

        idcg = sum(
            1 / math.log2(index + 2)
            for index in range(ideal_hits)
        )

        if idcg == 0:
            return 0.0

        return dcg / idcg

    def evaluate_user(
        self,
        user_id: str,
        recommendations: list,
        k: int = 5
    ):
        """
        Đánh giá recommendation cho một user.
        """

        relevant_products = (
            self.get_relevant_products(user_id)
        )

        recommended_products = [
            int(item["product_id"])
            for item in recommendations
        ]

        precision = self.precision_at_k(
            recommended_products,
            relevant_products,
            k
        )

        recall = self.recall_at_k(
            recommended_products,
            relevant_products,
            k
        )

        ndcg = self.ndcg_at_k(
            recommended_products,
            relevant_products,
            k
        )

        return {
            "user_id": user_id,
            "k": k,
            "precision_at_k": precision,
            "recall_at_k": recall,
            "ndcg_at_k": ndcg
        }

    def evaluate_users(
        self,
        recommendations_by_user: dict,
        k: int = 5
    ):
        """
        Đánh giá nhiều user.

        recommendations_by_user:
        {
            "U001": [...],
            "U002": [...],
            ...
        }
        """

        results = []

        for user_id, recommendations in (
            recommendations_by_user.items()
        ):
            result = self.evaluate_user(
                user_id=user_id,
                recommendations=recommendations,
                k=k
            )

            results.append(result)

        if not results:
            return {
                "precision_at_k": 0.0,
                "recall_at_k": 0.0,
                "ndcg_at_k": 0.0
            }

        result_df = pd.DataFrame(results)

        return {
            "precision_at_k": result_df[
                "precision_at_k"
            ].mean(),

            "recall_at_k": result_df[
                "recall_at_k"
            ].mean(),

            "ndcg_at_k": result_df[
                "ndcg_at_k"
            ].mean()
        }