from preprocessing import prepare_data
from features import create_tfidf_features
from content_based import ContentBasedRecommender


# =========================
# 1. Load dữ liệu
# =========================

products, interactions = prepare_data(
    "products_100.csv",
    "collaborative_dataset.csv"
)


# =========================
# 2. Tạo TF-IDF
# =========================

tfidf_matrix, vectorizer = create_tfidf_features(
    products
)


# =========================
# 3. Tạo Content-Based Model
# =========================

model = ContentBasedRecommender()

model.fit(
    products,
    tfidf_matrix
)


# =========================
# 4. Test recommendation
# =========================

product_id = products.iloc[0]["product_id"]

recommendations = model.recommend(
    product_id=product_id,
    top_k=5
)


# =========================
# 5. In kết quả
# =========================

print("\n===== PRODUCT =====")

product = products[
    products["product_id"] == product_id
].iloc[0]

print(
    f"{product['product_id']} - "
    f"{product['name']}"
)


print("\n===== CONTENT-BASED RECOMMENDATIONS =====")

for item in recommendations:
    print(
        f"{item['product_id']} - "
        f"{item['product_name']} - "
        f"score={item['score']:.4f}"
    )