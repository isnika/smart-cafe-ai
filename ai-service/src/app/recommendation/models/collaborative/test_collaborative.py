from preprocessing import prepare_data
from features import create_user_item_matrix
from collaborative import CollaborativeRecommender


# =========================
# 1. Load dữ liệu
# =========================

products, interactions = prepare_data(
    "products_100.csv",
    "collaborative_dataset.csv"
)


# =========================
# 2. Tạo User-Item Matrix
# =========================

user_item_matrix = create_user_item_matrix(
    interactions
)

print("===== USER-ITEM MATRIX =====")
print(user_item_matrix)


# =========================
# 3. Train model
# =========================

model = CollaborativeRecommender()

model.fit(
    user_item_matrix
)


# =========================
# 4. Test recommendation
# =========================

user_id = "U001"

recommendations = model.recommend(
    user_id=user_id,
    top_k=5
)


# =========================
# 5. In kết quả
# =========================

print("\n===== COLLABORATIVE RECOMMENDATIONS =====")

for item in recommendations:
    print(
        f"Product ID: {item['product_id']} "
        f"| Score: {item['score']:.4f}"
    )