import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity


class ContentBasedRecommender:

    def __init__(self):
        self.products = None
        self.tfidf_matrix = None
        self.similarity_matrix = None
        self.product_index = {}

    def fit(
        self,
        products: pd.DataFrame,
        tfidf_matrix
    ):
        """
        Huấn luyện Content-Based Recommender.

        Parameters:
            products:
                DataFrame sản phẩm.

            tfidf_matrix:
                Ma trận TF-IDF được tạo từ features.py.
        """

        if products.empty:
            raise ValueError("Products dataframe is empty.")

        if tfidf_matrix is None:
            raise ValueError("TF-IDF matrix is empty.")

        if len(products) != tfidf_matrix.shape[0]:
            raise ValueError(
                "Số lượng products không khớp với TF-IDF matrix."
            )

        # Lưu danh sách sản phẩm
        self.products = products.reset_index(drop=True)

        # Lưu TF-IDF matrix
        self.tfidf_matrix = tfidf_matrix

        # Tính Cosine Similarity
        self.similarity_matrix = cosine_similarity(
            self.tfidf_matrix
        )

        # Tạo mapping:
        # product_id -> vị trí trong matrix
        self.product_index = {
            product_id: index
            for index, product_id
            in enumerate(self.products["product_id"])
        }

    def recommend(
        self,
        product_id: int,
        top_k: int = 5
    ):
        """
        Tìm các sản phẩm tương tự với product_id.
        """

        if self.similarity_matrix is None:
            raise ValueError(
                "Model chưa được fit."
            )

        if product_id not in self.product_index:
            return []

        # Lấy vị trí của sản phẩm
        product_idx = self.product_index[product_id]

        # Lấy similarity score của sản phẩm
        similarity_scores = self.similarity_matrix[
            product_idx
        ]

        recommendations = []

        for index, score in enumerate(similarity_scores):

            # Không recommend chính sản phẩm đó
            if index == product_idx:
                continue

            recommendations.append({
                "product_id": int(
                    self.products.iloc[index]["product_id"]
                ),
                "product_name": self.products.iloc[index]["name"],
                "score": float(score)
            })

        # Sắp xếp giảm dần theo similarity
        recommendations.sort(
            key=lambda x: x["score"],
            reverse=True
        )

        return recommendations[:top_k]