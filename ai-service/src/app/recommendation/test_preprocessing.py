from preprocessing import prepare_data


products, interactions = prepare_data(
    "products_100.csv",
    "collaborative_dataset.csv"
)

print("===== PRODUCTS =====")
print(products.head())

print("\n===== INTERACTIONS =====")
print(interactions.head())

print("\nProduct shape:", products.shape)
print("Interaction shape:", interactions.shape)

