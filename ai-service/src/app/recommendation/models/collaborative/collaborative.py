import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity


class CollaborativeRecommender:

    def __init__(self):
        self.user_item_matrix = None
        self.item_similarity_matrix = None
        self.product_ids = []
        self.product_index = {}

    def fit(self, user_item_matrix: pd.DataFrame):
        """
        Xây dựng Collaborative Filtering model.

        Input:
            user_item_matrix:
                Ma trận User-Item được tạo từ features.py.

        Flow:
            User-Item Matrix
                ↓
            Item-Item Matrix
                ↓
            Cosine Similarity
        """

        if user_item_matrix.empty:
            raise ValueError(
                "User-Item matrix is empty."
            )

        # Lưu User-Item Matrix
        self.user_item_matrix = user_item_matrix

        # Danh sách product_id
        self.product_ids = list(
            user_item_matrix.columns
        )

        # Mapping:
        # product_id -> index
        self.product_index = {
            product_id: index
            for index, product_id
            in enumerate(self.product_ids)
        }

        # Chuyển:
        #
        # User × Product
        #
        # thành:
        #
        # Product × User
        item_user_matrix = user_item_matrix.T

        # Tính độ tương đồng giữa các sản phẩm
        self.item_similarity_matrix = cosine_similarity(
            item_user_matrix
        )

    def recommend(
        self,
        user_id: str,
        top_k: int = 5
    ):
        """
        Gợi ý sản phẩm cho một user.

        Flow:

        User
          ↓
        lịch sử mua hàng
          ↓
        các sản phẩm đã mua
          ↓
        tìm sản phẩm tương tự
          ↓
        loại sản phẩm đã mua
          ↓
        xếp hạng
          ↓
        Top-K
        """

        if self.user_item_matrix is None:
            raise ValueError(
                "Model chưa được fit."
            )

        # Kiểm tra user có tồn tại không
        if user_id not in self.user_item_matrix.index:
            return []

        # Lấy lịch sử mua hàng của user
        user_vector = self.user_item_matrix.loc[user_id]

        # Các sản phẩm user đã mua
        purchased_products = set(
            user_vector[
                user_vector > 0
            ].index
        )

        # Nếu user chưa mua sản phẩm nào
        if not purchased_products:
            return []

        scores = {}

        # Duyệt từng sản phẩm user đã mua
        for product_id in purchased_products:

            # Lấy vị trí của sản phẩm
            product_idx = self.product_index[
                product_id
            ]

            # Lấy similarity của sản phẩm
            similarity_scores = (
                self.item_similarity_matrix[
                    product_idx
                ]
            )

            # Quantity user đã mua
            quantity = float(
                user_vector[product_id]
            )

            # Duyệt các sản phẩm khác
            for index, similarity in enumerate(
                similarity_scores
            ):

                candidate_product_id = (
                    self.product_ids[index]
                )

                # Không recommend sản phẩm
                # user đã mua
                if candidate_product_id in purchased_products:
                    continue

                # Bỏ similarity bằng 0
                if similarity <= 0:
                    continue

                # Điểm recommendation
                scores[candidate_product_id] = (
                    scores.get(
                        candidate_product_id,
                        0
                    )
                    + float(similarity) * quantity
                )

        # Chuyển dictionary thành list
        recommendations = [
            {
                "product_id": product_id,
                "score": float(score)
            }
            for product_id, score
            in scores.items()
        ]

        # Sắp xếp giảm dần
        recommendations.sort(
            key=lambda x: x["score"],
            reverse=True
        )

        # Lấy Top-K
        return recommendations[:top_k]