from preprocessing import prepare_data
from features import (
    create_tfidf_features,
    create_user_item_matrix
)

from content_based import ContentBasedRecommender
from collaborative import CollaborativeRecommender
from hybrid import HybridRecommender


# ==========================================
# 1. Load data
# ==========================================

products, interactions = prepare_data(
    "products_100.csv",
    "collaborative_dataset.csv"
)


# ==========================================
# 2. Content-Based
# ==========================================

tfidf_matrix, vectorizer = create_tfidf_features(
    products
)

content_model = ContentBasedRecommender()

content_model.fit(
    products,
    tfidf_matrix
)


# ==========================================
# 3. Collaborative Filtering
# ==========================================

user_item_matrix = create_user_item_matrix(
    interactions
)

collaborative_model = CollaborativeRecommender()

collaborative_model.fit(
    user_item_matrix
)


# ==========================================
# 4. Lấy recommendation
# ==========================================

user_id = "U001"

# Ví dụ sản phẩm khách đang xem/mua
product_id = 1

content_recommendations = (
    content_model.recommend(
        product_id=product_id,
        top_k=5
    )
)

collaborative_recommendations = (
    collaborative_model.recommend(
        user_id=user_id,
        top_k=5
    )
)


# ==========================================
# 5. Hybrid
# ==========================================

hybrid_model = HybridRecommender(
    content_weight=0.5,
    collaborative_weight=0.5
)

hybrid_model.fit(products)


recommendations = hybrid_model.recommend(
    content_recommendations=
        content_recommendations,

    collaborative_recommendations=
        collaborative_recommendations,

    top_k=5
)


# ==========================================
# 6. Print
# ==========================================

print("\n===== CONTENT-BASED =====")

for item in content_recommendations:
    print(
        f"{item['product_id']} | "
        f"{item['product_name']} | "
        f"{item['score']:.4f}"
    )


print("\n===== COLLABORATIVE =====")

for item in collaborative_recommendations:
    print(
        f"{item['product_id']} | "
        f"{item['score']:.4f}"
    )


print("\n===== HYBRID =====")

for item in recommendations:
    print(
        f"{item['product_id']} | "
        f"{item['product_name']} | "
        f"{item['score']:.4f}"
    )


    '''
    Content
   ↓
điểm cho từng product

Collaborative
   ↓
điểm cho từng product

        ↓

Ghép những product giống nhau
        ↓
Tính điểm Hybrid
        ↓
Sort
        ↓
Top K
'''