import pandas as pd

from preprocessing import (
    load_products,
    load_interactions
)

from features import (
    create_tfidf_features,
    create_user_item_matrix
)

from content_based import ContentBasedRecommender
from collaborative import CollaborativeRecommender
from hybrid import HybridRecommender


class RecommendationModel:

    def __init__(
        self,
        content_weight: float = 0.5,
        collaborative_weight: float = 0.5
    ):
        self.content_weight = content_weight
        self.collaborative_weight = collaborative_weight

        # Data
        self.products = None
        self.interactions = None

        # Features
        self.tfidf_matrix = None
        self.vectorizer = None
        self.user_item_matrix = None

        # Models
        self.content_model = None
        self.collaborative_model = None
        self.hybrid_model = None

        self.is_fitted = False

    def fit(
        self,
        products: pd.DataFrame,
        interactions: pd.DataFrame
    ):
        """
        Train toàn bộ recommendation system.
        """

        if products.empty:
            raise ValueError(
                "Products dataframe is empty."
            )

        if interactions.empty:
            raise ValueError(
                "Interactions dataframe is empty."
            )

        # ==========================================
        # 1. Lưu data
        # ==========================================

        self.products = products.copy()
        self.interactions = interactions.copy()

        # ==========================================
        # 2. Tạo TF-IDF features
        # ==========================================

        (
            self.tfidf_matrix,
            self.vectorizer
        ) = create_tfidf_features(
            self.products
        )

        # ==========================================
        # 3. Content-Based
        # ==========================================

        self.content_model = (
            ContentBasedRecommender()
        )

        self.content_model.fit(
            self.products,
            self.tfidf_matrix
        )

        # ==========================================
        # 4. Tạo User-Item Matrix
        # ==========================================

        self.user_item_matrix = (
            create_user_item_matrix(
                self.interactions
            )
        )

        # ==========================================
        # 5. Collaborative Filtering
        # ==========================================

        self.collaborative_model = (
            CollaborativeRecommender()
        )

        self.collaborative_model.fit(
            self.user_item_matrix
        )

        # ==========================================
        # 6. Hybrid
        # ==========================================

        self.hybrid_model = HybridRecommender(
            content_weight=self.content_weight,
            collaborative_weight=self.collaborative_weight
        )

        self.hybrid_model.fit(
            self.products
        )

        # ==========================================
        # 7. Đánh dấu model đã fit
        # ==========================================

        self.is_fitted = True

        return self

    def recommend(
        self,
        user_id: str,
        product_id: int,
        top_k: int = 5
    ):
        """
        Generate hybrid recommendations.
        """

        if not self.is_fitted:
            raise ValueError(
                "Recommendation model chưa được fit."
            )

        if top_k <= 0:
            raise ValueError(
                "top_k phải lớn hơn 0."
            )

        # ==========================================
        # 1. Content-Based recommendations
        # ==========================================

        content_recommendations = (
            self.content_model.recommend(
                product_id=product_id,
                top_k=top_k
            )
        )

        # ==========================================
        # 2. Collaborative recommendations
        # ==========================================

        collaborative_recommendations = (
            self.collaborative_model.recommend(
                user_id=user_id,
                top_k=top_k
            )
        )

        # ==========================================
        # 3. Hybrid
        # ==========================================

        recommendations = (
            self.hybrid_model.recommend(
                content_recommendations=
                    content_recommendations,

                collaborative_recommendations=
                    collaborative_recommendations,

                top_k=top_k
            )
        )

        return recommendations