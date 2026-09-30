from preprocessing import prepare_data
from model import RecommendationModel


# ==========================================
# 1. Load data
# ==========================================

products, interactions = prepare_data(
    "products_100.csv",
    "collaborative_dataset.csv"
)


# ==========================================
# 2. Create Recommendation Model
# ==========================================

model = RecommendationModel(
    content_weight=0.5,
    collaborative_weight=0.5
)


# ==========================================
# 3. Fit model
# ==========================================

model.fit(
    products=products,
    interactions=interactions
)


print("===== MODEL FITTED =====")


# ==========================================
# 4. Recommendation
# ==========================================

user_id = "U001"
product_id = 1

recommendations = model.recommend(
    user_id=user_id,
    product_id=product_id,
    top_k=5
)


# ==========================================
# 5. Print result
# ==========================================

print("\n===== RECOMMENDATIONS =====")

for item in recommendations:
    print(
        f"Product ID: {item['product_id']} | "
        f"Product: {item['product_name']} | "
        f"Score: {item['score']:.4f}"
    )