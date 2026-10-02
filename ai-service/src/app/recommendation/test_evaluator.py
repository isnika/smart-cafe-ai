from preprocessing import prepare_data
from model import RecommendationModel
from evaluator import RecommendationEvaluator


# ==========================================
# 1. Load data
# ==========================================

products, interactions = prepare_data(
    "products_100.csv",
    "collaborative_dataset.csv"
)


# ==========================================
# 2. Train model
# ==========================================

model = RecommendationModel(
    content_weight=0.5,
    collaborative_weight=0.5
)

model.fit(
    products=products,
    interactions=interactions
)


# ==========================================
# 3. Tạo evaluator
# ==========================================

evaluator = RecommendationEvaluator(
    interactions
)


# ==========================================
# 4. Generate recommendation cho toàn bộ user
# ==========================================

recommendations_by_user = {}

user_ids = interactions["user_id"].unique()

for user_id in user_ids:

    # Lấy các sản phẩm user đã mua
    user_products = interactions[
        interactions["user_id"] == user_id
    ]["product_id"].unique()

    if len(user_products) == 0:
        continue

    # Dùng sản phẩm đầu tiên user đã mua
    product_id = int(user_products[0])

    recommendations = model.recommend(
        user_id=str(user_id),
        product_id=product_id,
        top_k=5
    )

    recommendations_by_user[
        str(user_id)
    ] = recommendations


# ==========================================
# 5. Đánh giá toàn bộ user
# ==========================================

result = evaluator.evaluate_users(
    recommendations_by_user=
        recommendations_by_user,
    k=5
)


# ==========================================
# 6. Print
# ==========================================

print("\n===== EVALUATION ALL USERS =====")

print(
    f"Number of users: "
    f"{len(recommendations_by_user)}"
)

print(
    f"Precision@5: "
    f"{result['precision_at_k']:.4f}"
)

print(
    f"Recall@5: "
    f"{result['recall_at_k']:.4f}"
)

print(
    f"NDCG@5: "
    f"{result['ndcg_at_k']:.4f}"
)