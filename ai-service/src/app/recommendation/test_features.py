from preprocessing import prepare_data
from features import (
    create_tfidf_features,
    create_user_item_matrix
)


products, interactions = prepare_data(
    "products_100.csv",
    "collaborative_dataset.csv"
)


# =========================
# TF-IDF
# =========================

tfidf_matrix, vectorizer = create_tfidf_features(
    products
)

print("===== TF-IDF =====")
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
print(user_item_matrix)

print("\nShape:", user_item_matrix.shape)