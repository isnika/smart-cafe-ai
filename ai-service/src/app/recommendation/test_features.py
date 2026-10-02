from preprocessing import prepare_data
from features import (
    create_tfidf_features,
    create_user_item_matrix
)


# =========================
# LOAD DATA
# =========================

products, interactions = prepare_data(
    "products.csv",
    "user_item_summary.csv"
)

print("===== DATA =====")
print("Products:", products.shape)
print("Interactions:", interactions.shape)


# =========================
# TF-IDF
# =========================

tfidf_matrix, vectorizer = create_tfidf_features(
    products
)

print("\n===== TF-IDF =====")
print("Shape:", tfidf_matrix.shape)

print("\nFeatures:")
print(vectorizer.get_feature_names_out()[:20])


# =========================
# USER-ITEM MATRIX
# =========================

user_item_matrix = create_user_item_matrix(
    interactions
)

print("\n===== USER-ITEM MATRIX =====")
print("Shape:", user_item_matrix.shape)

print("\nFirst 5 users:")
print(user_item_matrix.head())